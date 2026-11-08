const { Server } = require("socket.io");
const { parseCookie } = require("cookie");
const { TOKEN_COOKIE, verifyToken } = require("../middleware/authMiddleware");
const registerStudyHandler = require("./studyHandler");
const registerChatHandler = require("./chatHandler");

let io = null;

function initSocket(server) {
  io = new Server(server);

  // 연결할 때 REST와 같은 token 쿠키로 인증한다. (NF-001)
  io.use((socket, next) => {
    const token = parseCookie(socket.handshake.headers.cookie || "")[TOKEN_COOKIE];
    try {
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    // 개인 알림용 채널. 소켓 방 이름 규칙: user:{userId}, room:{roomId}
    socket.join(`user:${socket.user.id}`);

    registerStudyHandler(io, socket);
    registerChatHandler(io, socket);
  });

  return io;
}

// 컨트롤러·작업에서 알림을 보낼 때 사용: getIO().to(`user:${id}`).emit(...)
function getIO() {
  if (!io) throw new Error("Socket.IO가 아직 초기화되지 않았습니다.");
  return io;
}

module.exports = { initSocket, getIO };
