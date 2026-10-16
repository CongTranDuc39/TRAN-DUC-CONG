'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateClass,
  validateStudent,
  validateSubject,
  validateScore,
  calculateScore,
  calculateWeightedAverage,
} = require('../src/validation');

const validClass = () => ({ code: 'CNTTK23I', name: 'Công nghệ thông tin K23I', school_year: '2026-2027' });
const validStudent = () => ({
  student_code: 'DTC245200418', full_name: 'Trần Đức Công', dob: '2005-01-01',
  gender: 'Nam', email: 'cong@example.test', phone: '0912345678',
  address: 'Thái Nguyên', class_id: '1',
});
const validSubject = () => ({ code: 'CSDL', name: 'Cơ sở dữ liệu', credits: '3' });
const validScore = () => ({
  student_id: '1', subject_id: '2', semester: '1', academic_year: '2026-2027',
  attendance_score: '8', midterm_score: '7', final_score: '9',
});

function assertFieldError(validator, input, field) {
  const result = validator(input);
  assert.ok(result.errors && result.errors[field], `Cần báo lỗi trường ${field}`);
}

test('Lớp: chuẩn hóa mã và khoảng trắng, chấp nhận niên khóa đại học nhiều năm', () => {
  const result = validateClass({ ...validClass(), code: '  cntt_k23-i  ', name: '  Lớp K23I  ', school_year: '2023-2027' });
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.code, 'CNTT_K23-I');
  assert.equal(result.values.name, 'Lớp K23I');
});

test('Lớp: bắt buộc dữ liệu, giới hạn độ dài, mã và niên khóa hợp lệ', () => {
  for (const field of ['code', 'name', 'school_year']) {
    assertFieldError(validateClass, { ...validClass(), [field]: '   ' }, field);
  }
  for (const code of ['A'.repeat(21), 'CNTT 23', '<script>', 'LỚP']) {
    assertFieldError(validateClass, { ...validClass(), code }, 'code');
  }
  assertFieldError(validateClass, { ...validClass(), name: 'A'.repeat(101) }, 'name');
  for (const school_year of ['2026-2026', '2027-2026', '2026-2037', '26-27', '2026/2027']) {
    assertFieldError(validateClass, { ...validClass(), school_year }, 'school_year');
  }
});

test('Sinh viên: chuẩn hóa mã, tên và cho phép bỏ thông tin tùy chọn', () => {
  const result = validateStudent({ ...validStudent(), student_code: ' dtc245200418 ', full_name: ' Trần Đức Công ', dob: '', email: '', phone: '', address: '', class_id: '' });
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.student_code, 'DTC245200418');
  assert.equal(result.values.full_name, 'Trần Đức Công');
  assert.equal(result.values.class_id, null);
});

test('Sinh viên: từ chối ngày không tồn tại, ngày tương lai và ngày không đúng định dạng', () => {
  for (const dob of ['2025-02-29', '2024-02-30', '2005-13-01', '2005-00-01', '2005-01-00', '01/01/2005', '2999-01-01']) {
    assertFieldError(validateStudent, { ...validStudent(), dob }, 'dob');
  }
  assert.deepEqual(validateStudent({ ...validStudent(), dob: '2004-02-29' }).errors, {});
});

test('Sinh viên: ràng buộc email, số điện thoại, giới tính và ID lớp', () => {
  for (const phone of ['0912345678', '+84912345678']) {
    assert.deepEqual(validateStudent({ ...validStudent(), phone }).errors, {});
  }
  for (const phone of ['1234567890', '091234567', '09123456789', '+840912345678', 'abcdef']) {
    assertFieldError(validateStudent, { ...validStudent(), phone }, 'phone');
  }
  for (const email of ['cong', 'cong@', '@example.test', 'a'.repeat(145) + '@b.test']) {
    assertFieldError(validateStudent, { ...validStudent(), email }, 'email');
  }
  assertFieldError(validateStudent, { ...validStudent(), gender: 'Không hợp lệ' }, 'gender');
  for (const class_id of ['0', '-1', '1.5', 'abc', '1e2']) {
    assertFieldError(validateStudent, { ...validStudent(), class_id }, 'class_id');
  }
});

test('Sinh viên: từ chối mã và tên không hợp lệ, địa chỉ quá dài', () => {
  for (const student_code of ['', 'A'.repeat(21), 'DTC 123']) {
    assertFieldError(validateStudent, { ...validStudent(), student_code }, 'student_code');
  }
  for (const full_name of ['', 'A'.repeat(101)]) {
    assertFieldError(validateStudent, { ...validStudent(), full_name }, 'full_name');
  }
  assertFieldError(validateStudent, { ...validStudent(), address: 'A'.repeat(256) }, 'address');
});

test('Môn học: chuẩn hóa mã, số tín chỉ nguyên từ 1 đến 10', () => {
  const result = validateSubject({ ...validSubject(), code: ' csdl ', name: ' Cơ sở dữ liệu ' });
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.code, 'CSDL');
  assert.equal(result.values.name, 'Cơ sở dữ liệu');
  assert.equal(Number(result.values.credits), 3);
  for (const credits of ['', '0', '11', '2.5', 'abc', '1e1']) {
    assertFieldError(validateSubject, { ...validSubject(), credits }, 'credits');
  }
  for (const credits of ['1', '10']) {
    assert.deepEqual(validateSubject({ ...validSubject(), credits }).errors, {});
  }
  assertFieldError(validateSubject, { ...validSubject(), code: 'C S D L' }, 'code');
  assertFieldError(validateSubject, { ...validSubject(), name: 'A'.repeat(101) }, 'name');
});

test('Điểm: kiểm tra ID, học kỳ, năm học và tất cả thành phần điểm', () => {
  assert.deepEqual(validateScore(validScore()).errors, {});
  for (const field of ['student_id', 'subject_id']) {
    for (const value of ['', '0', '-1', '1.5', 'abc', '1e2']) {
      assertFieldError(validateScore, { ...validScore(), [field]: value }, field);
    }
  }
  for (const semester of ['', '0', '4', '1.5', 'abc']) {
    assertFieldError(validateScore, { ...validScore(), semester }, 'semester');
  }
  assertFieldError(validateScore, { ...validScore(), academic_year: '2026-2029' }, 'academic_year');
  for (const field of ['attendance_score', 'midterm_score', 'final_score']) {
    for (const value of ['', ' ', '-0.01', '10.01', 'abc', 'NaN', 'Infinity', '1e1', '8.999']) {
      assertFieldError(validateScore, { ...validScore(), [field]: value }, field);
    }
    for (const value of ['0', '10', '8.25']) {
      assert.deepEqual(validateScore({ ...validScore(), [field]: value }).errors, {});
    }
  }
});

test('Điểm tổng kết: tỷ trọng chuyên cần 10%, giữa kỳ 30%, cuối kỳ 60%, làm tròn 2 chữ số', () => {
  assert.equal(calculateScore(8, 7, 9), 8.3);
  assert.equal(calculateScore(0, 0, 0), 0);
  assert.equal(calculateScore(10, 10, 10), 10);
  assert.equal(calculateScore(7.25, 8.33, 9.17), 8.73);
  assert.equal(calculateScore(0, 0.11, 4.42), 2.69);
});

test('Điểm trung bình: có trọng số tín chỉ và xử lý danh sách trống', () => {
  assert.equal(calculateWeightedAverage([]), null);
  assert.equal(calculateWeightedAverage([{ total_score: 8, credits: 3 }, { total_score: 6, credits: 2 }]), 7.2);
  assert.equal(calculateWeightedAverage([{ total_score: '8.30', credits: '3' }, { total_score: '9.10', credits: '2' }]), 8.62);
  assert.equal(calculateWeightedAverage([{ total_score: 0, credits: 1 }, { total_score: 3.3, credits: 3 }]), 2.48);
});
