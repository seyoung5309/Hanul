const path = require("path");
const { isProd } = require("./config/env");
const { createRouter, request, response, serveStatic } = require("./http");
const apiRouter = require("./router");
const { notFound, errorHandler } = require("./middleware/errorHandler");

// Express 없이 직접 만든 도구(server/http)로 요청을 처리한다.
const router = createRouter();

router.use(response.middleware(), request.query(), request.cookies());

// API 테스트 페이지는 개발 환경에서만 연다.
if (isProd) router.get("/html/test.html", (req, res) => res.status(404).end());

// 프론트엔드(client 폴더)를 같은 서버에서 제공 → 쿠키·CORS 설정이 단순해진다.
router.use(serveStatic(path.join(__dirname, "..", "client")));
router.get("/", (req, res) => res.redirect("/html/index.html"));

router.use("/api", request.jsonBody({ limit: 1024 * 1024 }), apiRouter);
router.use("/api", notFound);
router.use(errorHandler);

// http.createServer에 넘기는 요청 처리 함수. 어디서도 처리하지 않은 요청은 404.
function app(req, res) {
  router(req, res, (err) => {
    if (res.headersSent) return res.end();
    res.statusCode = err ? 500 : 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(err ? "Internal Server Error" : `Cannot ${req.method} ${req.url.split("?")[0]}`);
  });
}

module.exports = app;
