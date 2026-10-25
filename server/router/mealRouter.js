const express = require("express");
const mealService = require("../services/mealService");
const { check, isDate } = require("../utils/validate");
const { kstNow } = require("../utils/date");

const router = express.Router();

// 오늘의 급식 ?date=YYYY-MM-DD (없으면 오늘, 한국 시간)
router.get("/", async (req, res) => {
  const { year, month, day } = kstNow();
  const date = req.query.date ?? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  check(isDate(date), "date는 YYYY-MM-DD 형식입니다.");
  res.json(await mealService.getMeals(date));
});

module.exports = router;
