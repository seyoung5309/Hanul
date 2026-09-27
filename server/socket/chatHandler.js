// 반·공부방 채팅 (CL-002, SR-004, SR-011)
//
// 클라이언트 → 서버
//   chat:send   { roomId, message }   참가자인지 확인 → chat INSERT → 방 전체에 전송
//
// 서버 → 클라이언트
//   chat:new    { id, roomId, userId, message, time }   room:{roomId} 전체
//   chat:unread { roomId }                              방 화면 밖 참가자의 user:{userId} (방별 알림)
//
// 메시지는 저장할 때 그대로 두고, 화면에 넣을 때 textContent로 출력해 XSS를 막는다. (NF-004)
module.exports = function registerChatHandler(io, socket) {
  // TODO
};
