const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/health", (req, res) => res.json({ ok: true }));

// 회원가입·로그인은 로그인 전에도 써야 하므로 userRouter 안에서 따로 인증을 건다.
router.use("/users", require("./userRouter"));

// 나머지는 전부 로그인 필요 (NF-001)
router.use("/subjects", requireAuth, require("./subjectRouter"));
router.use("/classes", requireAuth, require("./classRouter"));
router.use("/rooms", requireAuth, require("./roomRouter"));
router.use("/study", requireAuth, require("./studyRouter"));
router.use("/todos", requireAuth, require("./todoRouter"));
router.use("/schedules", requireAuth, require("./scheduleRouter"));
router.use("/ai", requireAuth, require("./aiRouter"));
router.use("/notifications", requireAuth, require("./notificationRouter"));

module.exports = router;
