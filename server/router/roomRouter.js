const express = require("express");

const router = express.Router();

// :roomId가 붙은 API는 모두 참가자인지 먼저 확인해야 한다. (NF-005)
// SR-001 POST   /                       방 생성 → 6자리 방 코드 발급
//        GET    /                       내가 참여한 방 목록
// SR-002 POST   /join                   방 코드로 참여 (1인당 방 개수 제한)
// SR-003 GET    /:roomId                방 정보와 참가자 공부 현황
// SR-005 DELETE /:roomId                방 폭파 (방장만)
// SR-006 PATCH  /:roomId/owner          방장 위임
// SR-007 DELETE /:roomId/members/me     나가기 (방장은 위임 후)
// SR-009 DELETE /:roomId/members/:userId  내보내기 (방장만)
// SR-008 POST   /:roomId/invites        초대 (방장만)
// SR-008 PATCH  /invites/:inviteId      초대 수락·거절 (초대받은 사람)
// CL-002 GET    /:roomId/chats?before=  채팅 이전 기록 (새 메시지는 소켓)
// CL-003 PUT    /:roomId/chats/read     읽음 위치 갱신
// CL-004 POST   /:roomId/chats/:chatId/report  채팅 신고

module.exports = router;
