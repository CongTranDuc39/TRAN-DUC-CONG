'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const validation = require('./validation');
const createRepository = require('./repository');
const { createMetrics } = require('./metrics');

const entities = {
  classes: { label: 'lớp học', validate: validation.validateClass, fields: ['code', 'name', 'school_year'], defaults: { school_year: '2026-2027' } },
  students: { label: 'sinh viên', validate: validation.validateStudent, fields: ['student_code', 'full_name', 'dob', 'gender', 'email', 'phone', 'address', 'class_id'], defaults: { gender: 'Nam' } },
  subjects: { label: 'môn học', validate: validation.validateSubject, fields: ['code', 'name', 'credits'], defaults: { credits: 3 } },
  scores: { label: 'điểm số', validate: validation.validateScore, fields: ['student_id', 'subject_id', 'semester', 'academic_year', 'attendance_score', 'midterm_score', 'final_score'], defaults: { semester: 1, academic_year: '2026-2027' } }
};

function createApp(pool) {
  const app = express();
  const repo = createRepository(pool);
  const metrics = createMetrics();
  app.use(metrics.middleware);
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('query parser', 'simple');
  app.use(helmet({
    // Demo uses HTTP localhost; HTTPS-only upgrade would prevent static assets in some browsers.
    contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null, frameAncestors: ["'none'"] } },
    strictTransportSecurity: false
  }));
  // Docker-internal Prometheus endpoint; the public Nginx location denies access.
  app.get('/metrics', metrics.handler);
  app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
  app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));

  app.get('/health', async (req, res) => {
    let timer;
    try {
      await Promise.race([
        pool.query({ sql: 'SELECT 1', timeout: 2000 }),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Database timeout')), 3000); timer.unref(); })
      ]);
      res.set('Cache-Control', 'no-store').json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).set('Cache-Control', 'no-store').json({ status: 'error', database: 'disconnected' });
    } finally { clearTimeout(timer); }
  });

  app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 50 }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    let csrfToken = req.cookies.qlsv_csrf;
    if (typeof csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(csrfToken)) {
      csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('qlsv_csrf', csrfToken, { httpOnly: true, sameSite: 'strict', secure: false, path: '/' });
    }
    Object.assign(res.locals, {
      path: req.path,
      title: 'Quản lý sinh viên',
      csrfToken,
      success: ({ created: 'Đã thêm dữ liệu thành công.', updated: 'Đã cập nhật dữ liệu thành công.', deleted: 'Đã xóa dữ liệu thành công.' })[req.query.success] || null,
      error: null,
      errors: {},
      values: {},
      query: req.query,
      formatDate: (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—',
      formatScore: (value) => value === null || value === undefined ? '—' : Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      isSelected: (a, b) => String(a ?? '') === String(b ?? '')
    });
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST') {
      const token = req.body?._csrf;
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)
        || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(csrfToken))) {
        return res.status(403).render('error', { status: 403, title: 'Phiên biểu mẫu không hợp lệ', message: 'Biểu mẫu đã hết hiệu lực. Vui lòng tải lại trang và thử lại.' });
      }
    }
    next();
  });

  app.get('/', async (req, res) => {
    const [statsRows, recentStudents, classStats, recentScores] = await Promise.all([
      repo.rows(`SELECT (SELECT COUNT(*) FROM students) students, (SELECT COUNT(*) FROM classes) classes,
        (SELECT COUNT(*) FROM subjects) subjects, (SELECT COUNT(*) FROM scores) scores,
        (SELECT ROUND(SUM(sc.total_score * su.credits) / NULLIF(SUM(su.credits), 0), 2)
         FROM scores sc JOIN subjects su ON su.id = sc.subject_id) average`),
      repo.rows('SELECT s.id, s.student_code, s.full_name, c.name class_name FROM students s LEFT JOIN classes c ON c.id = s.class_id ORDER BY s.id DESC LIMIT 5'),
      repo.rows('SELECT c.name, c.code, COUNT(s.id) student_count FROM classes c LEFT JOIN students s ON s.class_id = c.id GROUP BY c.id ORDER BY student_count DESC, c.name LIMIT 8'),
      repo.rows('SELECT s.full_name, su.name subject_name, sc.total_score FROM scores sc JOIN students s ON s.id = sc.student_id JOIN subjects su ON su.id = sc.subject_id ORDER BY sc.id DESC LIMIT 5')
    ]);
    res.render('dashboard', { title: 'Tổng quan', stats: statsRows[0], recentStudents, classStats, recentScores });
  });

  async function listPage(entity, req, res, extra = {}, status = 200) {
    const [data, options] = await Promise.all([repo[entity](req.query), repo.options()]);
    const locals = { ...options, [entity]: data, title: `Quản lý ${entities[entity].label}`, ...extra };
    if (entity === 'scores') {
      locals.summary = {
        count: data.length,
        passed: data.filter((row) => Number(row.total_score) >= 5).length,
        failed: data.filter((row) => Number(row.total_score) < 5).length,
        average: validation.calculateWeightedAverage(data)
      };
    }
    return res.status(status).render(`${entity}/index`, locals);
  }

  async function formPage(entity, res, values, action, editing, errors = {}, error = null, status = 200) {
    const options = await repo.options();
    const heading = `${editing ? 'Cập nhật' : 'Thêm'} ${entities[entity].label}`;
    return res.status(status).render(`${entity}/form`, { ...options, title: heading, heading, values, action, errors, error });
  }

  const missing = (res) => res.status(404).render('error', { status: 404, title: 'Không tìm thấy', message: 'Dữ liệu không tồn tại hoặc đã được xóa.' });
  const conflictMessage = (error) => {
    if (error.code === 'ER_DUP_ENTRY') return 'Dữ liệu bị trùng: mã, email hoặc điểm của sinh viên/môn học/học kỳ/năm học đã tồn tại.';
    if (error.code === 'ER_NO_REFERENCED_ROW_2') return 'Sinh viên, lớp học hoặc môn học được chọn không tồn tại. Vui lòng chọn lại.';
    if (error.code === 'ER_ROW_IS_REFERENCED_2') return 'Dữ liệu đang được sử dụng. Hãy xóa điểm liên quan hoặc chuyển sinh viên sang lớp khác trước khi xóa.';
    return null;
  };

  for (const [entity, config] of Object.entries(entities)) {
    app.get(`/${entity}`, (req, res) => listPage(entity, req, res));
    app.get(`/${entity}/new`, (req, res) => formPage(entity, res, config.defaults, `/${entity}`, false));
    app.get(`/${entity}/:id/edit`, async (req, res) => {
      if (!validation.validId(req.params.id)) return missing(res);
      const records = await repo.rows(`SELECT * FROM ${entity} WHERE id = ?`, [Number(req.params.id)]);
      if (!records.length) return missing(res);
      return formPage(entity, res, records[0], `/${entity}/${req.params.id}`, true);
    });

    async function save(req, res, editing) {
      const id = req.params.id;
      if (editing) {
        if (!validation.validId(id)) return missing(res);
        if (!(await repo.rows(`SELECT id FROM ${entity} WHERE id = ?`, [Number(id)])).length) return missing(res);
      }
      const { values, errors } = config.validate(req.body);
      const action = editing ? `/${entity}/${id}` : `/${entity}`;
      if (Object.keys(errors).length) return formPage(entity, res, values, action, editing, errors, 'Vui lòng kiểm tra các trường được đánh dấu.', 422);
      const params = config.fields.map((field) => values[field]);
      try {
        if (editing) await repo.rows(`UPDATE ${entity} SET ${config.fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`, [...params, Number(id)]);
        else await repo.rows(`INSERT INTO ${entity} (${config.fields.join(', ')}) VALUES (${config.fields.map(() => '?').join(', ')})`, params);
        return res.redirect(303, `/${entity}?success=${editing ? 'updated' : 'created'}`);
      } catch (error) {
        const message = conflictMessage(error);
        if (message) return formPage(entity, res, values, action, editing, {}, message, 409);
        throw error;
      }
    }

    app.post(`/${entity}`, (req, res) => save(req, res, false));
    app.post(`/${entity}/:id`, (req, res) => save(req, res, true));
    app.post(`/${entity}/:id/delete`, async (req, res) => {
      if (!validation.validId(req.params.id)) return missing(res);
      try {
        const result = await repo.rows(`DELETE FROM ${entity} WHERE id = ?`, [Number(req.params.id)]);
        if (!result.affectedRows) return missing(res);
        return res.redirect(303, `/${entity}?success=deleted`);
      } catch (error) {
        const message = conflictMessage(error);
        if (message) return listPage(entity, req, res, { error: message }, 409);
        throw error;
      }
    });
  }

  app.use((req, res) => missing(res));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const unavailable = ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'EHOSTUNREACH'].includes(error.code);
    const status = error.status >= 400 && error.status < 500 ? error.status : unavailable ? 503 : 500;
    // Never log SQL, request bodies, connection options or secrets.
    console.error(`Yêu cầu thất bại: HTTP ${status}; mã ${typeof error.code === 'string' ? error.code.replace(/[^A-Z0-9_]/g, '') : 'INTERNAL_ERROR'}`);
    Object.assign(res.locals, { path: req.path, title: 'Có lỗi xảy ra', csrfToken: '', success: null, error: null });
    res.status(status).render('error', {
      status,
      message: status === 503 ? 'Chưa kết nối được MySQL. Vui lòng kiểm tra dịch vụ cơ sở dữ liệu và thử lại.'
        : status === 413 ? 'Dữ liệu gửi lên quá lớn.' : status === 400 ? 'Yêu cầu không hợp lệ.'
          : 'Không thể xử lý yêu cầu. Vui lòng thử lại sau.'
    });
  });
  return app;
}

module.exports = { createApp };
