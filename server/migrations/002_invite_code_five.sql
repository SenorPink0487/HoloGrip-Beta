-- Invite codes are 5 letters or digits. Replace any stored 8-character code
-- before the column shrinks, so existing classes keep a usable code.
ALTER TABLE classes MODIFY invite_code VARCHAR(8) NOT NULL;

UPDATE classes
SET invite_code = UPPER(SUBSTRING(SHA2(id, 256), 1, 5));

ALTER TABLE classes MODIFY invite_code CHAR(5) NOT NULL;
