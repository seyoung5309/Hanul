-- 이미 만든 DB에 적용하는 변경분 (mysql.sql에는 반영됨)
-- 회원가입 디자인에 생년월일 칸이 없어서, 나중에 받을 수 있도록 선택 항목으로 바꾼다.
USE hanul;

ALTER TABLE user
  MODIFY COLUMN birth DATE NULL;
