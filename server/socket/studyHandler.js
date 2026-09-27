// 공부 상태 실시간 공유 (ST-001, ST-002, ST-003, SR-003, SR-012)
//
// 클라이언트 → 서버
//   room:enter      { roomId }             방 화면 입장. 참가자인지 확인 후 socket.join(`room:${roomId}`) (NF-005)
//   room:leave      { roomId }             방 화면 퇴장
//   study:start     { subjectId, roomId }  study_session·study_log 생성
//   study:stop      { }                    세션 종료 → study_daily에 날짜별로 나눠 더함
//   study:heartbeat { }                    last_heartbeat_at 갱신 (30초마다)
//
// 서버 → 클라이언트 (room:{roomId} 전체)
//   study:status    { userId, status, startedAt }
module.exports = function registerStudyHandler(io, socket) {
  // TODO
};
