ALTER TABLE refresh_tokens ADD COLUMN session_id CHAR(36) NULL,
  ADD KEY idx_refresh_session (session_id);
