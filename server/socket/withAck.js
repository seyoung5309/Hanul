const HttpError = require("../utils/httpError");

function withAck(socket, event, handler) {
  socket.on(event, async (payload, ack) => {
    if (typeof payload == "function") {
      [payload, ack] = [{}, payload];
    }

    const reply = typeof ack === "function" ? ack : () => {};

    try {
      const result = await handler(payload ?? {});
      reply({ ok: true, ...result });
    } catch (err) {
      if (!(err instanceof HttpError)) {
        console.error(`[socket] ${event}`, err);
      }

      reply({
        ok: false,
        message:
          err instanceof HttpError ? err.message : "서버 오류가 발생했습니다.",
      });
    }
  });
}

module.exports = withAck;
