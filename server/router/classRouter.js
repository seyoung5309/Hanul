const express = require("express");
const controller = require("../controllers/classController");

const router = express.Router();

// 반 메인은 type='class'인 공부방이라 학생 목록·공부 현황·채팅은 roomRouter를 함께 쓴다.
router.get("/me", controller.getMyClass); // CL-001 내 반 정보와 반 메인 roomId

module.exports = router;
