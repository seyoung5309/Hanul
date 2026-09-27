const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const apiRouter = require("./router");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// 프론트엔드(client 폴더)를 같은 서버에서 제공 → 쿠키·CORS 설정이 단순해진다.
app.use(express.static(path.join(__dirname, "..", "client")));
app.get("/", (req, res) => res.redirect("/html/index.html"));

app.use("/api", apiRouter);
app.use("/api", notFound);
app.use(errorHandler);

module.exports = app;
