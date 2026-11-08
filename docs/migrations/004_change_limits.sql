-- 이미 만든 DB에 적용하는 변경분 (mysql.sql에는 반영됨)
-- 설정 화면: 이름·아이디와 비밀번호는 14일에 한 번만 바꿀 수 있다. 마지막으로 바꾼 시각을 기록한다.

ALTER TABLE user
  ADD COLUMN account_changed_at DATETIME NULL AFTER hide_ranking_view;

ALTER TABLE auth
  ADD COLUMN password_changed_at DATETIME NULL AFTER password;
