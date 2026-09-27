const express = require("express");
const controller = require("../controllers/subjectController");

const router = express.Router();

router.get("/", controller.getSubjects); // 과목 목록 (과목 선택 UI 공통)

module.exports = router;
