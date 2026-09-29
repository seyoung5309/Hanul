-- 이미 만든 DB에 적용하는 변경분 (mysql.sql에는 반영됨)
-- AI-007: 긴 대화는 앞부분을 요약해 두고, 요약에 포함된 마지막 채팅 id를 기록한다.
USE hanul;

ALTER TABLE ai_room
  ADD COLUMN summary_chat_id INT NULL AFTER summary;
