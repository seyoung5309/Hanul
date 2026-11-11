// 정적 파일 제공 (express.static 대신). client 폴더의 화면 파일을 그대로 내려준다.
//   - GET·HEAD만 처리하고, 없는 파일은 next()로 넘긴다.
//   - 폴더 주소는 그 안의 index.html ("/html/" → html/index.html), 끝에 "/"가 없으면 붙여서 이동
//   - root 밖으로 나가는 경로(../), 숨김 파일(.env 등)은 내주지 않는다.
//   - Last-Modified·ETag로 바뀌지 않은 파일은 304 (브라우저 캐시 재사용)

const fs = require("fs");
const path = require("path");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function statOrNull(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function serveStatic(root) {
  const base = path.resolve(root);

  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const rawPath = req.url.split("?")[0];
    let pathname;
    try {
      pathname = decodeURIComponent(rawPath);
    } catch {
      return next(); // 잘못 인코딩된 주소
    }
    if (pathname.includes("\0")) return next();
    if (pathname.split("/").some((part) => part.startsWith("."))) return next(); // 숨김 파일, "../"

    let file = path.join(base, pathname);
    if (file !== base && !file.startsWith(base + path.sep)) return next(); // root 밖

    let stat = statOrNull(file);
    if (stat?.isDirectory()) {
      if (!rawPath.endsWith("/")) {
        const search = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
        res.statusCode = 301;
        res.setHeader("Location", `${rawPath}/${search}`);
        return res.end();
      }
      file = path.join(file, "index.html");
      stat = statOrNull(file);
    }
    if (!stat?.isFile()) return next();

    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const lastModified = stat.mtime.toUTCString();
    res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=0"); // 매번 바뀌었는지 확인 (express.static 기본값)
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", lastModified);

    const ifNoneMatch = req.headers["if-none-match"];
    const ifModifiedSince = req.headers["if-modified-since"];
    const notModified = ifNoneMatch
      ? ifNoneMatch.split(",").map((tag) => tag.trim()).includes(etag)
      : Boolean(ifModifiedSince) && Math.floor(stat.mtimeMs / 1000) <= Math.floor(Date.parse(ifModifiedSince) / 1000);
    if (notModified) {
      res.statusCode = 304;
      return res.end();
    }

    res.statusCode = 200;
    res.setHeader("Content-Length", stat.size);
    if (req.method === "HEAD") return res.end();

    const stream = fs.createReadStream(file);
    stream.on("error", next);
    stream.pipe(res);
  };
}

module.exports = { serveStatic };
