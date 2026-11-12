const { createRouter } = require("../http");
const { requireAuth } = require("../middleware/authMiddleware");

const router = createRouter();

router.get("/health", (req, res) => res.json({ ok: true }));

router.use("/users", require("./userRouter"));

router.use("/subjects", requireAuth, require("./subjectRouter"));
router.use("/classes", requireAuth, require("./classRouter"));
router.use("/rooms", requireAuth, require("./roomRouter"));
router.use("/study", requireAuth, require("./studyRouter"));
router.use("/todos", requireAuth, require("./todoRouter"));
router.use("/schedules", requireAuth, require("./scheduleRouter"));
router.use("/ai", requireAuth, require("./aiRouter"));
router.use("/notifications", requireAuth, require("./notificationRouter"));
router.use("/meals", requireAuth, require("./mealRouter"));

module.exports = router;
