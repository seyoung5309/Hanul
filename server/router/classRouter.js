const { createRouter } = require("../http");
const controller = require("../controllers/classController");

const router = createRouter();

router.get("/me", controller.getMyClass); // 내 반

module.exports = router;
