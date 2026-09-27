const express = require("express");

const router = express.Router();

// AI 호출 전 ai_usage로 일일 사용량을 확인한다. (AI-003)
// AI-006 GET    /rooms                  대화방 목록
// AI-006 POST   /rooms                  대화방 생성
// AI-006 GET    /rooms/:aiRoomId        대화 기록
// AI-006 DELETE /rooms/:aiRoomId        대화방 삭제
// AI-005 POST   /rooms/:aiRoomId/chats  질문 → 답변
// AI-001 POST   /plans                  학습 계획 생성
// AI-004 POST   /plans/regenerate       강도 조정 후 재생성
// AI-002 POST   /plans/apply            계획을 일정·To Do로 저장
//        GET    /usage                  오늘 남은 사용량

module.exports = router;
