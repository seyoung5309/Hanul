// 요청 읽기 미들웨어: 쿼리(req.query), 쿠키(req.cookies), JSON 본문(req.body)
// 이미 값이 있으면(다른 곳에서 읽었으면) 다시 읽지 않는다.

const querystring = require("querystring");
const { parseCookie } = require("cookie");
const HttpError = require("../utils/httpError");

// 값을 덮어쓸 수 있는 자기 속성으로 둔다. (Express의 req.query는 읽기 전용 getter라 대입이 안 됨)
function setOwn(req, key, value) {
  Object.defineProperty(req, key, { value, writable: true, configurable: true, enumerable: true });
}

// ?a=1&b=2 → { a: "1", b: "2" } (같은 이름이 여러 번이면 배열. Express 5 기본값과 같음)
function query() {
  return (req, res, next) => {
    if (!Object.hasOwn(req, "query")) {
      const search = req.url.includes("?") ? req.url.slice(req.url.indexOf("?") + 1) : "";
      setOwn(req, "query", { ...querystring.parse(search) });
    }
    next();
  };
}

function cookies() {
  return (req, res, next) => {
    if (!req.cookies) req.cookies = parseCookie(req.headers.cookie || "");
    next();
  };
}

const isJson = (req) => /^application\/([\w.+-]+\+)?json\b/i.test(req.headers["content-type"] || "");

// 본문을 끝까지 모은다. limit을 넘으면 413
// 넘은 뒤에도 연결을 끊지 않고 나머지를 버리며 끝까지 받는다. (중간에 끊으면 413 응답을 못 받음)
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > limit) reject(new HttpError(413, "요청이 너무 큽니다."));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

// Content-Type이 JSON이면 객체·배열로 읽는다. 본문이 없거나 JSON이 아니면 {}.
// 잘못된 JSON이나 숫자·문자열 하나뿐인 JSON은 400 (express.json의 strict 모드와 같음)
function jsonBody({ limit = 1024 * 1024 } = {}) {
  return async (req, res, next) => {
    if (req.body !== undefined) return next();
    if (!isJson(req) || req.method === "GET" || req.method === "HEAD") {
      req.body = {};
      return next();
    }

    const raw = await readRaw(req, limit);
    if (raw.trim() === "") {
      req.body = {};
      return next();
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "요청 형식(JSON)이 올바르지 않습니다.");
    }
    if (parsed === null || typeof parsed !== "object") {
      throw new HttpError(400, "요청 형식(JSON)이 올바르지 않습니다.");
    }
    req.body = parsed;
    next();
  };
}

module.exports = { query, cookies, jsonBody };
