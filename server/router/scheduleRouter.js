const express = require("express");
const controller = require("../controllers/scheduleController");

const router = express.Router();

// 날짜는 "2026-10-01" 또는 "2026-10-01T14:30" (한국 시간). 하루 전에 알림을 보낸다. (TD-007)
router.post("/", controller.createSchedule); //                 TD-001 { title, descript?, date, subjectIds? }
router.get("/", controller.getSchedules); //                    TD-003 ?from=&to=&limit= 날짜순
router.get("/:scheduleId", controller.getSchedule);
router.patch("/:scheduleId", controller.updateSchedule); //     TD-002 보낸 값만 수정
router.delete("/:scheduleId", controller.deleteSchedule); //    TD-002

module.exports = router;
