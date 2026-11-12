const { createRouter } = require("../http");
const controller = require("../controllers/todoController");

const router = createRouter();

// 마감일이 존재하면 하루 전에 notification 관련 코드가 알림 보냄
router.post("/", controller.createTodo); // To Do 생성하기 { title, descript?, dueDate?, subjectIds? }
router.get("/", controller.getTodos); //  To Do 목록 불러오기
router.patch("/done-all", controller.setAllDone); // 전체 To Do 완료 처리하기
router.patch("/:todoId", controller.updateTodo); // To Do 수정하기
router.patch("/:todoId/done", controller.setDone); // 끝낸 To Do 체크하기 { isDone }
router.delete("/:todoId", controller.deleteTodo); // To Do 삭제하기

module.exports = router;
