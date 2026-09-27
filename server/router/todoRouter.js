const express = require("express");

const router = express.Router();

// TD-004 POST   /                       할 일 등록
//        GET    /                       할 일 목록
// TD-005 PATCH  /:todoId                수정
// TD-006 PATCH  /:todoId/done           완료 체크
// TD-005 DELETE /:todoId                삭제

module.exports = router;
