const { createRouter } = require("../http");
const controller = require("../controllers/scheduleController");

const router = createRouter();

router.post("/", controller.createSchedule); // 일정 생성 { title, descript?, date, subjectIds? }
router.get("/", controller.getSchedules); // 일정 불러오기 ?from=&to=&limit= 날짜순
router.get("/:scheduleId", controller.getSchedule); // 일정 세부 사항 불러오기
router.patch("/:scheduleId", controller.updateSchedule); // 일정 수정하기
router.delete("/:scheduleId", controller.deleteSchedule); // 일정 삭제하기

module.exports = router;
