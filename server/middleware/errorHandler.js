const HttpError = require("../utils/httpError");

function notFound(req, res, next) {
  next(new HttpError(404, "존재하지 않는 API입니다."));
}

// 컨트롤러에서 처리되지 않은 에러를 반환
function toHttpError(err) {
  if (err instanceof HttpError) {
    return err;
  }

  if (err.code == "ER_DUP_ENTRY") {
    return new HttpError(409, "이미 존재하는 값입니다.");
  }

  if (err.code === "ER_NO_REFERENCED_ROW_2") {
    return new HttpError(400, "존재하지 않는 항목을 참조했습니다.");
  }

  return err;
}

function errorHandler(err, req, res, next) {
  let httpError = toHttpError(err);
  let status = httpError.status || 500;
  let expected = httpError instanceof HttpError; // message를 가졌으면 그거 출력됨
  if (!expected && status >= 500) console.error(err);

  res.status(status).json({
    message:
      !expected && status >= 500
        ? "서버 오류가 발생했습니다."
        : httpError.message,
  });
}

module.exports = { notFound, errorHandler };
