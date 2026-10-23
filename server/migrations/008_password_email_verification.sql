CREATE TABLE password_email_verifications (
  user_id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  auth_version BIGINT NOT NULL,
  code_hash BINARY(32) NOT NULL,
  sent_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_password_verification_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
