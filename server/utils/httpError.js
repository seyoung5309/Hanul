// 컨트롤러에서 throw new HttpError(404, "공부방이 없습니다.") 처럼 사용한다.
// Express 5는 async 함수의 에러도 errorHandler로 넘겨준다.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
