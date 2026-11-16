// 응답 도구: res.status, res.json, res.cookie, res.clearCookie, res.redirect

const { stringifySetCookie } = require("cookie");

function appendSetCookie(res, value) {
  const prev = res.getHeader("Set-Cookie");
  const list = prev === undefined ? [] : Array.isArray(prev) ? prev : [prev];
  res.setHeader("Set-Cookie", [...list, value]);
}

// options: { httpOnly, sameSite, secure, maxAge(ms, Express와 같음), path, expires }
function toCookieOptions(options = {}) {
  const { maxAge, path = "/", sameSite, ...rest } = options;
  return {
    ...rest,
    path,
    ...(sameSite && { sameSite: String(sameSite).toLowerCase() }),
    // Set-Cookie의 Max-Age는 초 단위 (Express는 ms로 받음)
    ...(maxAge !== undefined && {
      maxAge: Math.floor(maxAge / 1000),
      expires: new Date(Date.now() + maxAge),
    }),
  };
}

function middleware() {
  return (req, res, next) => {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };

    res.json = (data) => {
      const body = JSON.stringify(data);

      if (!res.getHeader("Content-Type")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }

      res.setHeader("Content-Length", Buffer.byteLength(body));
      res.end(req.method === "HEAD" ? undefined : body);
      return res;
    };

    res.cookie = (name, value, options) => {
      appendSetCookie(
        res,
        stringifySetCookie({
          name,
          value: String(value),
          ...toCookieOptions(options),
        }),
      );
      return res;
    };

    res.clearCookie = (name, options = {}) => {
      const { maxAge, expires, ...rest } = options;
      appendSetCookie(
        res,
        stringifySetCookie({
          name,
          value: "",
          ...toCookieOptions(rest),
          expires: new Date(0),
        }),
      );
      return res;
    };

    res.redirect = (statusOrUrl, maybeUrl) => {
      const [status, url] =
        maybeUrl === undefined ? [302, statusOrUrl] : [statusOrUrl, maybeUrl];
      res.statusCode = status;
      res.setHeader("Location", url);
      res.end();
      return res;
    };

    next();
  };
}

module.exports = { middleware };
