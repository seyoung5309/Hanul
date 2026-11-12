// Express 없이 서버를 만드는 도구 정리
//   createRouter(): 라우터 (router.js)
//   request.*: req.query, req.cookies, req.body 읽기 (request.js)
//   response.*: res.status, res.json, res.cookie, res.clearCookie, res.redirect (response.js)
//   serveStatic(): 정적 파일 제공 (static.js)

const { createRouter } = require("./router");
const request = require("./request");
const response = require("./response");
const { serveStatic } = require("./static");

module.exports = { createRouter, request, response, serveStatic };
