const HttpError = require("../utils/httpError");

function notFound(req, res, next) {
  next(new HttpError(404, "존재하지 않는 API입니다."));
}

// 컨트롤러에서 따로 처리하지 않은 에러를 응답으로 바꾼다.
function toHttpError(err) {
  if (err instanceof HttpError) return err;
  if (err.type === "entity.parse.failed") return new HttpError(400, "요청 형식(JSON)이 올바르지 않습니다.");
  if (err.code === "ER_DUP_ENTRY") return new HttpError(409, "이미 존재하는 값입니다.");
  if (err.code === "ER_NO_REFERENCED_ROW_2") return new HttpError(400, "존재하지 않는 항목을 참조했습니다.");
  return err;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const httpError = toHttpError(err);
  const status = httpError.status || 500;
  const expected = httpError instanceof HttpError; // 우리가 안내 문구를 정해서 던진 에러
  if (!expected && status >= 500) console.error(err);

  // 예상하지 못한 500대 에러는 내부 정보가 새지 않도록 메시지를 감춘다.
  // HttpError는 503("AI 사용자가 많아요")처럼 5xx여도 정해 둔 안내 문구를 그대로 보여준다.
  res.status(status).json({
    message: !expected && status >= 500 ? "서버 오류가 발생했습니다." : httpError.message,
  });
}

module.exports = { notFound, errorHandler };
