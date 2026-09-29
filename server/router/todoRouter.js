const express = require("express");
const controller = require("../controllers/todoController");

const router = express.Router();

// 마감일은 선택. "2026-10-01" 또는 "2026-10-01T14:30" (한국 시간). 마감 하루 전에 알림을 보낸다. (TD-007)
router.post("/", controller.createTodo); //                     TD-004 { title, descript?, dueDate?, subjectIds? }
router.get("/", controller.getTodos); //                        ?done=true|false
router.patch("/done-all", controller.setAllDone); //            전체 완료 처리하기
router.patch("/:todoId", controller.updateTodo); //             TD-005 보낸 값만 수정
router.patch("/:todoId/done", controller.setDone); //           TD-006 { isDone }
router.delete("/:todoId", controller.deleteTodo); //            TD-005

module.exports = router;
