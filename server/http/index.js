// Express 없이 서버를 만드는 도구 모음
//   createRouter()   라우터 (router.js)
//   request.*        req.query, req.cookies, req.body 읽기 (request.js)
//   response.*       res.status, res.json, res.cookie, res.clearCookie, res.redirect (response.js)

const { createRouter } = require("./router");
const request = require("./request");
const response = require("./response");

module.exports = { createRouter, request, response };
