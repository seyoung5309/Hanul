-- 이미 만든 DB에 적용하는 변경분 (mysql.sql에는 반영됨)
-- 스터디룸 썸네일 (Cloudinary URL). 방장이 ⋮ 메뉴에서 올린다.

ALTER TABLE study_room
  ADD COLUMN img VARCHAR(255) NULL AFTER comment;
