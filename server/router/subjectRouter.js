const { createRouter } = require("../http");
const controller = require("../controllers/subjectController");

const router = createRouter();

router.get("/", controller.getSubjects); // 과목 목록 불러오기

module.exports = router;
