'use strict';

const text = (value) => typeof value === 'string' ? value.trim() : '';
const validId = (value) => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;
const isYear = (value) => /^(19|20)\d{2}-(19|20)\d{2}$/.test(value)
  && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;

function requiredText(input, values, errors, field, label, max) {
  values[field] = text(input[field]);
  if (!values[field] || values[field].length > max) {
    errors[field] = `${label} bắt buộc và không quá ${max} ký tự.`;
  }
}

function code(input, values, errors, field, label) {
  values[field] = text(input[field]).toUpperCase();
  if (!/^[A-Z0-9_-]{1,20}$/.test(values[field])) {
    errors[field] = `${label} gồm 1–20 chữ cái không dấu, chữ số, dấu gạch ngang hoặc gạch dưới.`;
  }
}

function year(input, values, errors, field) {
  values[field] = text(input[field]);
  if (!isYear(values[field])) errors[field] = 'Nhập năm học liên tiếp, ví dụ 2026-2027.';
}

function integer(input, values, errors, field, label, min, max) {
  const raw = text(input[field]);
  values[field] = raw;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min || Number(raw) > max) {
    errors[field] = `${label} phải là số nguyên từ ${min} đến ${max}.`;
  } else values[field] = Number(raw);
}

function reference(input, values, errors, field, label, optional = false) {
  const raw = text(input[field]);
  values[field] = raw;
  if (optional && raw === '') values[field] = null;
  else if (!validId(raw)) errors[field] = `Vui lòng chọn ${label} hợp lệ.`;
  else values[field] = Number(raw);
}

function validateClass(input = {}) {
  const values = {}, errors = {};
  code(input, values, errors, 'code', 'Mã lớp');
  requiredText(input, values, errors, 'name', 'Tên lớp', 100);
  values.school_year = text(input.school_year);
  const yearMatch = /^((?:19|20)\d{2})-((?:19|20)\d{2})$/.exec(values.school_year);
  if (!yearMatch || Number(yearMatch[2]) <= Number(yearMatch[1]) || Number(yearMatch[2]) - Number(yearMatch[1]) > 10) {
    errors.school_year = 'Nhập niên khóa có năm kết thúc lớn hơn năm bắt đầu, tối đa 10 năm, ví dụ 2023-2027.';
  }
  return { values, errors };
}

function validateStudent(input = {}) {
  const values = {}, errors = {};
  code(input, values, errors, 'student_code', 'Mã sinh viên');
  requiredText(input, values, errors, 'full_name', 'Họ và tên', 100);
  values.dob = text(input.dob) || null;
  if (values.dob) {
    const parsed = new Date(`${values.dob}T00:00:00.000Z`);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dob) || Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== values.dob || values.dob < '1900-01-01' || values.dob > today) {
      errors.dob = 'Ngày sinh phải tồn tại, từ năm 1900 và không ở tương lai.';
    }
  }
  values.gender = text(input.gender);
  if (!['Nam', 'Nữ', 'Khác'].includes(values.gender)) errors.gender = 'Vui lòng chọn giới tính hợp lệ.';
  values.email = text(input.email).toLowerCase() || null;
  if (values.email && (values.email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))) {
    errors.email = 'Email không hợp lệ hoặc dài quá 150 ký tự.';
  }
  values.phone = text(input.phone) || null;
  if (values.phone && !/^(0\d{9}|\+84\d{9})$/.test(values.phone)) errors.phone = 'Số điện thoại gồm 10 chữ số bắt đầu bằng 0 hoặc +84 và 9 chữ số.';
  values.address = text(input.address) || null;
  if (values.address && values.address.length > 255) errors.address = 'Địa chỉ không quá 255 ký tự.';
  reference(input, values, errors, 'class_id', 'lớp học', true);
  return { values, errors };
}

function validateSubject(input = {}) {
  const values = {}, errors = {};
  code(input, values, errors, 'code', 'Mã môn học');
  requiredText(input, values, errors, 'name', 'Tên môn học', 100);
  integer(input, values, errors, 'credits', 'Số tín chỉ', 1, 10);
  return { values, errors };
}

function validateScore(input = {}) {
  const values = {}, errors = {};
  reference(input, values, errors, 'student_id', 'sinh viên');
  reference(input, values, errors, 'subject_id', 'môn học');
  integer(input, values, errors, 'semester', 'Học kỳ', 1, 3);
  year(input, values, errors, 'academic_year');
  for (const field of ['attendance_score', 'midterm_score', 'final_score']) {
    const raw = text(input[field]);
    values[field] = raw;
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(raw) || Number(raw) < 0 || Number(raw) > 10) {
      errors[field] = 'Điểm bắt buộc, từ 0 đến 10, tối đa 2 chữ số thập phân.';
    } else values[field] = Number(raw);
  }
  return { values, errors };
}

function calculateScore(attendance, midterm, final) {
  const weightedHundredths = Math.round(Number(attendance) * 100)
    + 3 * Math.round(Number(midterm) * 100) + 6 * Math.round(Number(final) * 100);
  return Math.floor((weightedHundredths + 5) / 10) / 100;
}

function calculateWeightedAverage(entries) {
  const credits = entries.reduce((sum, row) => sum + Number(row.credits), 0);
  if (!credits) return null;
  const weightedHundredths = entries.reduce((sum, row) => sum + Math.round(Number(row.total_score) * 100) * Number(row.credits), 0);
  return Math.floor((2 * weightedHundredths + credits) / (2 * credits)) / 100;
}

module.exports = { validId, validateClass, validateStudent, validateSubject, validateScore, calculateScore, calculateWeightedAverage };
