-- 이미 만든 DB에 적용하는 변경분 (mysql.sql에는 반영됨)
-- 1) 3시간마다 응답 확인 (ST-003)
-- 2) 과목 이름 중복 방지 (seed.sql을 여러 번 실행해도 안전)
USE hanul;

ALTER TABLE study_session
  ADD COLUMN confirmed_at   DATETIME NULL AFTER last_heartbeat_at,
  ADD COLUMN check_deadline DATETIME NULL AFTER confirmed_at;

ALTER TABLE subject
  ADD UNIQUE (name);
