const cron = require("node-cron");

const options = { timezone: "Asia/Seoul" };

// 정해진 시간마다 도는 서버 작업
function startJobs() {
  // ST-003 매분: heartbeat가 끊겼거나 최대 공부 시간을 넘긴 세션 자동 종료
  cron.schedule("* * * * *", endStaleSessions, options);

  // TD-007 매분: 곧 다가오는 일정·To Do 마감 알림
  cron.schedule("* * * * *", sendDueNotifications, options);

  // SR-010 매일 04:00: 마지막 활동 후 30일 지난 공부방 삭제
  cron.schedule("0 4 * * *", deleteInactiveRooms, options);
}

async function endStaleSessions() {
  // TODO
}

async function sendDueNotifications() {
  // TODO
}

async function deleteInactiveRooms() {
  // TODO
}

module.exports = startJobs;
