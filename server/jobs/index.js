const cron = require("node-cron");
const studyModel = require("../models/studyModel");
const studyService = require("../services/studyService");
const roomModel = require("../models/roomModel");
const roomService = require("../services/roomService");
const scheduleModel = require("../models/scheduleModel");
const todoModel = require("../models/todoModel");
const notificationService = require("../services/notificationService");
const { formatKst } = require("../utils/date");
const { getIO } = require("../socket");

const INACTIVE_ROOM_DAYS = 30; // SR-010: 마지막 활동(참가·공부·채팅) 후 이 기간이 지나면 삭제
const DUE_NOTICE_HOURS = 24; // TD-007: 일정·마감 이 시간 전에 알림

const {
  CHECK_INTERVAL_SECONDS,
  CHECK_RESPONSE_SECONDS,
  HEARTBEAT_TIMEOUT_SECONDS,
} = studyService;

// 작업 하나가 실패해도 서버가 멈추지 않도록 에러는 로그만 남긴다.
function schedule(expression, name, task) {
  cron.schedule(
    expression,
    async () => {
      try {
        await task();
      } catch (err) {
        console.error(`[job] ${name}`, err);
      }
    },
    { name, timezone: "Asia/Seoul", noOverlap: true },
  );
}

// 정해진 시간마다 도는 서버 작업
function startJobs() {
  // ST-003 10초마다: 3시간 응답 확인, 창이 닫혀 연결이 끊긴 공부 종료
  schedule("*/10 * * * * *", "study-check", checkStudySessions);

  // TD-007 매분: 24시간 안에 다가오는 일정·To Do 마감 알림
  schedule("* * * * *", "due-notifications", sendDueNotifications);

  // SR-010 매일 04:00: 마지막 활동 후 30일 지난 공부방 삭제
  schedule("0 4 * * *", "inactive-rooms", deleteInactiveRooms);
}

async function checkStudySessions() {
  const io = getIO();

  // 1) 응답 마감이 지난 세션 종료 → 확인 창이 뜬 시각까지만 기록
  for (const session of await studyModel.findExpiredChecks(CHECK_RESPONSE_SECONDS)) {
    await studyService.endSession(io, session.id, {
      status: "자동종료",
      endAt: session.endAt,
      reason: "no-response",
    });
  }

  // 2) 3시간이 지난 세션에 확인 창 띄우기
  for (const session of await studyModel.startChecks(CHECK_INTERVAL_SECONDS, CHECK_RESPONSE_SECONDS)) {
    io.to(`user:${session.userId}`).emit("study:check", { deadline: session.checkDeadline });
  }

  // 3) 창을 닫아 heartbeat가 끊긴 세션·방 기록 종료 → 마지막 응답 시각까지만 기록
  for (const session of await studyModel.findDisconnectedSessions(HEARTBEAT_TIMEOUT_SECONDS)) {
    await studyService.endSession(io, session.id, {
      status: "자동종료",
      endAt: session.endAt,
      reason: "disconnected",
    });
  }
  await studyModel.endDisconnectedLogs(HEARTBEAT_TIMEOUT_SECONDS);
}

// 일정 시각·마감 24시간 전부터 한 번만 알린다. (알림을 꺼 둔 사용자도 보낸 것으로 처리해 다시 묻지 않음)
async function sendDueNotifications() {
  const io = getIO();

  const schedules = await scheduleModel.findDueSoon(DUE_NOTICE_HOURS);
  for (const s of schedules) {
    await notificationService.notify(io, [s.userId], {
      title: "다가오는 일정",
      descript: `'${s.title}' 일정이 ${formatKst(s.date)}에 있습니다.`,
      type: "schedule",
      targetType: "schedule",
      targetId: s.id,
    });
  }
  await scheduleModel.markNotified(schedules.map((s) => s.id));

  const todos = await todoModel.findDueSoon(DUE_NOTICE_HOURS);
  for (const t of todos) {
    await notificationService.notify(io, [t.userId], {
      title: "To Do 마감 임박",
      descript: `'${t.title}' 마감이 ${formatKst(t.dueDate)}입니다.`,
      type: "schedule",
      targetType: "todo",
      targetId: t.id,
    });
  }
  await todoModel.markNotified(todos.map((t) => t.id));
}

async function deleteInactiveRooms() {
  const io = getIO();
  for (const roomId of await roomModel.findInactiveRoomIds(INACTIVE_ROOM_DAYS)) {
    await roomService.closeRoom(io, roomId, "inactive");
  }
}

module.exports = startJobs;
