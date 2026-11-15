-- 이미 만든 DB에 적용하는 변경분 (mysql.sql에는 반영됨)
-- 메일로 비밀번호를 재설정하는 기능(UD-006)을 없앴다. 재설정 토큰 테이블을 지운다.
-- (비밀번호 변경은 설정 화면에서 기존 비밀번호로 한다: PUT /api/users/me/password)

DROP TABLE IF EXISTS password_reset;
