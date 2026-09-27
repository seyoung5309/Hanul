const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { isProd } = require("./config/env");
const apiRouter = require("./router");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  req.body ??= {}; // Express 5는 본문이 없으면 undefined라서 빈 객체로 맞춘다.
  next();
});
app.use(cookieParser());

// API 테스트 페이지는 개발 환경에서만 연다.
if (isProd) app.get("/html/test.html", (req, res) => res.status(404).end());

// 프론트엔드(client 폴더)를 같은 서버에서 제공 → 쿠키·CORS 설정이 단순해진다.
app.use(express.static(path.join(__dirname, "..", "client")));
app.get("/", (req, res) => res.redirect("/html/index.html"));

app.use("/api", apiRouter);
app.use("/api", notFound);
app.use(errorHandler);

module.exports = app;
