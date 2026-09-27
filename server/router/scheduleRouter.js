const express = require("express");

const router = express.Router();

// TD-001 POST   /                       일정 등록
// TD-003 GET    /?from=&to=             기간 내 일정 (월·주 달력)
// TD-002 PATCH  /:scheduleId            수정
// TD-002 DELETE /:scheduleId            삭제

module.exports = router;
