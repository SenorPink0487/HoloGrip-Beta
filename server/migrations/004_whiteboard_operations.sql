CREATE TABLE whiteboard_operations (
  class_id CHAR(36) NOT NULL,
  op_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (class_id, op_id),
  CONSTRAINT fk_whiteboard_operations_class FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
