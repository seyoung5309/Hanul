const HttpError = require("../utils/httpError");

// 소켓 이벤트를 등록한다. 클라이언트가 콜백을 넘기면 결과를 돌려준다.
//   성공: { ok: true, ...handler의 반환값 }   실패: { ok: false, message }
// 사용(클라이언트): socket.emit("study:start", { subjectId: 1 }, (res) => { if (!res.ok) alert(res.message); });
function withAck(socket, event, handler) {
  socket.on(event, async (payload, ack) => {
    if (typeof payload === "function") [payload, ack] = [{}, payload];
    const reply = typeof ack === "function" ? ack : () => {};

    try {
      const result = await handler(payload ?? {});
      reply({ ok: true, ...result });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(`[socket] ${event}`, err);
      reply({ ok: false, message: err instanceof HttpError ? err.message : "서버 오류가 발생했습니다." });
    }
  });
}

module.exports = withAck;
