-- MySQL 8.4. Script được chạy trong MYSQL_DATABASE khi volume được tạo lần đầu.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS classes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    school_year VARCHAR(9) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_classes_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS students (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_code VARCHAR(20) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    dob DATE NULL,
    gender ENUM('Nam', 'Nữ', 'Khác') NOT NULL DEFAULT 'Khác',
    email VARCHAR(150) NULL,
    phone VARCHAR(20) NULL,
    address VARCHAR(255) NULL,
    class_id INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_students_code UNIQUE (student_code),
    CONSTRAINT uq_students_email UNIQUE (email),
    CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    INDEX idx_students_full_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS subjects (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    credits TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_subjects_code UNIQUE (code),
    CONSTRAINT chk_subjects_credits CHECK (credits BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS scores (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_id INT UNSIGNED NOT NULL,
    subject_id INT UNSIGNED NOT NULL,
    semester TINYINT UNSIGNED NOT NULL,
    academic_year VARCHAR(9) NOT NULL,
    attendance_score DECIMAL(4, 2) NOT NULL,
    midterm_score DECIMAL(4, 2) NOT NULL,
    final_score DECIMAL(4, 2) NOT NULL,
    total_score DECIMAL(4, 2) GENERATED ALWAYS AS (
        ROUND(attendance_score * 0.1 + midterm_score * 0.3 + final_score * 0.6, 2)
    ) STORED,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_scores_enrollment UNIQUE (student_id, subject_id, semester, academic_year),
    CONSTRAINT fk_scores_student FOREIGN KEY (student_id) REFERENCES students (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_scores_subject FOREIGN KEY (subject_id) REFERENCES subjects (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_scores_semester CHECK (semester BETWEEN 1 AND 3),
    CONSTRAINT chk_scores_attendance CHECK (attendance_score BETWEEN 0 AND 10),
    CONSTRAINT chk_scores_midterm CHECK (midterm_score BETWEEN 0 AND 10),
    CONSTRAINT chk_scores_final CHECK (final_score BETWEEN 0 AND 10),
    INDEX idx_scores_period (academic_year, semester)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dữ liệu phục vụ demo. Thông tin liên hệ đều là dữ liệu minh họa.
INSERT INTO classes (id, code, name, school_year) VALUES
    (1, 'CNTT-K23I', 'Công nghệ thông tin K23I', '2023-2027'),
    (2, 'CNTT-K23A', 'Công nghệ thông tin K23A', '2023-2027'),
    (3, 'CNTT-K24A', 'Công nghệ thông tin K24A', '2024-2028');

INSERT INTO students (id, student_code, full_name, dob, gender, email, phone, address, class_id) VALUES
    (1, 'DTC245200418', 'Trần Đức Công', NULL, 'Nam', 'cong.demo@example.test', NULL, NULL, 1),
    (2, 'DEMO230002', 'Nguyễn Minh An', '2005-02-15', 'Nam', 'an.demo@example.test', NULL, 'Địa chỉ minh họa 02', 1),
    (3, 'DEMO230003', 'Lê Phương Anh', '2005-06-20', 'Nữ', 'anh.demo@example.test', NULL, 'Địa chỉ minh họa 03', 1),
    (4, 'DEMO230004', 'Phạm Hải Bình', '2005-09-12', 'Nam', 'binh.demo@example.test', NULL, 'Địa chỉ minh họa 04', 2),
    (5, 'DEMO230005', 'Hoàng Thu Hà', '2005-12-03', 'Nữ', 'ha.demo@example.test', NULL, 'Địa chỉ minh họa 05', 2),
    (6, 'DEMO240006', 'Đỗ Khánh Linh', '2006-04-18', 'Nữ', 'linh.demo@example.test', NULL, 'Địa chỉ minh họa 06', 3),
    (7, 'DEMO240007', 'Vũ Đức Minh', '2006-08-25', 'Nam', 'minh.demo@example.test', NULL, 'Địa chỉ minh họa 07', 3),
    (8, 'DEMO240008', 'Bùi Gia Hân', NULL, 'Khác', NULL, NULL, NULL, NULL);

INSERT INTO subjects (id, code, name, credits) VALUES
    (1, 'CSDL', 'Cơ sở dữ liệu', 3),
    (2, 'LTWEB', 'Lập trình Web', 4),
    (3, 'CTDLGT', 'Cấu trúc dữ liệu và giải thuật', 3),
    (4, 'MMT', 'Mạng máy tính', 2);

INSERT INTO scores (student_id, subject_id, semester, academic_year, attendance_score, midterm_score, final_score) VALUES
    (1, 1, 1, '2026-2027', 9.00, 8.00, 8.50),
    (1, 2, 1, '2026-2027', 10.00, 8.50, 9.00),
    (1, 3, 1, '2026-2027', 8.00, 7.50, 8.00),
    (2, 1, 1, '2026-2027', 8.00, 7.00, 7.50),
    (2, 2, 1, '2026-2027', 9.00, 8.00, 8.00),
    (3, 1, 1, '2026-2027', 10.00, 9.00, 9.50),
    (3, 4, 1, '2026-2027', 9.00, 8.50, 8.00),
    (4, 3, 1, '2026-2027', 7.00, 6.00, 5.50),
    (5, 2, 1, '2026-2027', 8.00, 8.00, 8.50),
    (6, 4, 1, '2026-2027', 8.00, 7.00, 7.00),
    (7, 1, 1, '2026-2027', 6.00, 4.00, 3.50),
    (1, 4, 2, '2026-2027', 9.00, 8.00, 8.50);
