const HttpError = require("../utils/httpError");

function notFound(req, res, next) {
  next(new HttpError(404, "존재하지 않는 API입니다."));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);

  // 500 에러는 내부 정보가 새지 않도록 메시지를 감춘다.
  res.status(status).json({
    message: status >= 500 ? "서버 오류가 발생했습니다." : err.message,
  });
}

module.exports = { notFound, errorHandler };
