'use strict';

const { validId } = require('./validation');

module.exports = function createRepository(pool) {
  const rows = async (sql, params = []) => (await pool.execute(sql, params))[0];
  const like = (query) => `%${query.replace(/[!%_]/g, '!$&')}%`;
  const search = (query) => typeof query === 'string' ? query.trim().slice(0, 100) : '';

  async function classes(query = {}) {
    const q = like(search(query.q));
    return rows(`SELECT c.*, COUNT(s.id) student_count FROM classes c
      LEFT JOIN students s ON s.class_id = c.id
      WHERE c.code LIKE ? ESCAPE '!' OR c.name LIKE ? ESCAPE '!'
      GROUP BY c.id ORDER BY c.id DESC`, [q, q]);
  }

  async function students(query = {}) {
    const q = like(search(query.q));
    const params = [q, q, q];
    let filter = '';
    if (query.class_id === 'unassigned') filter = ' AND s.class_id IS NULL';
    else if (validId(query.class_id)) { filter = ' AND s.class_id = ?'; params.push(Number(query.class_id)); }
    return rows(`SELECT s.*, c.name class_name, c.code class_code,
      (SELECT ROUND(SUM(sc.total_score * su.credits) / NULLIF(SUM(su.credits), 0), 2)
       FROM scores sc JOIN subjects su ON su.id = sc.subject_id WHERE sc.student_id = s.id) total_average
      FROM students s LEFT JOIN classes c ON c.id = s.class_id
      WHERE (s.student_code LIKE ? ESCAPE '!' OR s.full_name LIKE ? ESCAPE '!' OR s.email LIKE ? ESCAPE '!')
      ${filter} ORDER BY s.id DESC`, params);
  }

  async function subjects(query = {}) {
    const q = like(search(query.q));
    return rows(`SELECT su.*, COUNT(sc.id) score_count FROM subjects su LEFT JOIN scores sc ON sc.subject_id = su.id
      WHERE su.code LIKE ? ESCAPE '!' OR su.name LIKE ? ESCAPE '!'
      GROUP BY su.id ORDER BY su.id DESC`, [q, q]);
  }

  async function scores(query = {}) {
    const q = like(search(query.q));
    const params = [q, q, q];
    const filters = [];
    for (const [field, column] of [['class_id', 's.class_id'], ['student_id', 'sc.student_id'], ['subject_id', 'sc.subject_id']]) {
      if (validId(query[field])) { filters.push(`${column} = ?`); params.push(Number(query[field])); }
    }
    if (/^[123]$/.test(String(query.semester))) { filters.push('sc.semester = ?'); params.push(Number(query.semester)); }
    if (typeof query.academic_year === 'string' && query.academic_year.trim()) {
      filters.push('sc.academic_year = ?'); params.push(query.academic_year.trim().slice(0, 9));
    }
    return rows(`SELECT sc.*, s.student_code, s.full_name, c.name class_name,
      su.name subject_name, su.code subject_code, su.credits
      FROM scores sc JOIN students s ON s.id = sc.student_id
      JOIN subjects su ON su.id = sc.subject_id LEFT JOIN classes c ON c.id = s.class_id
      WHERE (s.full_name LIKE ? ESCAPE '!' OR s.student_code LIKE ? ESCAPE '!' OR su.name LIKE ? ESCAPE '!')
      ${filters.length ? `AND ${filters.join(' AND ')}` : ''} ORDER BY sc.id DESC`, params);
  }

  async function options() {
    const [classRows, studentRows, subjectRows] = await Promise.all([
      rows('SELECT id, code, name FROM classes ORDER BY name'),
      rows('SELECT id, student_code, full_name FROM students ORDER BY full_name'),
      rows('SELECT id, code, name, credits FROM subjects ORDER BY name')
    ]);
    return { classes: classRows, students: studentRows, subjects: subjectRows };
  }

  return { rows, classes, students, subjects, scores, options };
};
