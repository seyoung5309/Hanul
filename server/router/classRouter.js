const express = require("express");

const router = express.Router();

// 반 메인은 type='class'인 공부방이라 채팅·현황은 roomRouter를 함께 쓴다.
// CL-001 GET    /me                     내 현재 반 정보와 반 메인 room_id
// CL-001 GET    /me/members             같은 반 학생 목록과 공부 현황

module.exports = router;
