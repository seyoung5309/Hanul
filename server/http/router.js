// Express 없이 쓰는 라우터. Express Router와 같은 사용법을 지원한다.
//   router.get/post/put/patch/delete(path, ...handlers)   "/rooms/:roomId" 처럼 :이름으로 값을 받는다
//   router.use([path], ...handlers)                       미들웨어, 하위 라우터 연결 (path로 시작하는 요청)
//   handler(req, res, next)                               next(err)면 오류 처리기(인자 4개)로 넘어간다
//   async handler에서 던진 에러도 next(err)로 넘긴다. (Express 5와 같음)
//
// 라우터 자체도 (req, res, next) 함수라서 다른 라우터나 Express 앱에 그대로 끼울 수 있다.
// 주소는 대소문자를 구분하지 않고, 끝의 "/"는 있어도 없어도 같다. (Express 기본값과 같음)

const METHODS = ["get", "post", "put", "patch", "delete"];

// "/rooms/:roomId/chats" → { regex, keys: ["roomId"] }
// prefix면 그 경로로 시작하는 주소도 맞는다. (use)
function compilePath(path, { prefix }) {
  const keys = [];
  const pattern = path
    .replace(/\/+$/, "")
    .split("/")
    .map((part) => {
      if (!part.startsWith(":")) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      keys.push(part.slice(1));
      return "([^/]+)";
    })
    .join("/");
  const end = prefix ? "(?=/|$)" : "/?$";
  return { regex: new RegExp(`^${pattern}${end}`, "i"), keys };
}

function matchLayer(layer, pathname) {
  const match = layer.regex.exec(pathname);
  if (!match) return null;
  const params = {};
  layer.keys.forEach((key, i) => {
    try {
      params[key] = decodeURIComponent(match[i + 1]);
    } catch {
      params[key] = match[i + 1]; // 잘못 인코딩된 값은 그대로
    }
  });
  return { params, matched: match[0] };
}

// 핸들러를 실행하고, 동기·비동기 에러를 모두 next(err)로 넘긴다.
function call(handler, args, next) {
  try {
    const result = handler(...args);
    if (result && typeof result.then === "function") result.catch(next);
  } catch (err) {
    next(err);
  }
}

function createRouter() {
  const layers = [];

  // done: 이 라우터에서 처리하지 못했을 때 부르는 바깥쪽 next
  function router(req, res, done = () => {}) {
    const originalUrl = req.url;
    const [pathname, search = ""] = originalUrl.split(/\?(.*)/s);
    const queryPart = search ? `?${search}` : "";
    let index = 0;

    const next = (err) => {
      req.url = originalUrl; // 하위 라우터가 바꾼 주소를 되돌린다
      const layer = layers[index++];
      if (!layer) return done(err);

      const methodOk = !layer.method
        || layer.method === req.method
        || (layer.method === "GET" && req.method === "HEAD");
      const found = methodOk && matchLayer(layer, pathname);
      if (!found) return next(err);

      const isErrorHandler = layer.handler.length === 4;
      if (Boolean(err) !== isErrorHandler) return next(err); // 에러면 오류 처리기만, 아니면 일반 핸들러만

      req.params = { ...req.params, ...found.params };
      // use로 연결한 하위 라우터에는 연결 경로를 뺀 주소를 보여 준다. ("/rooms/2" → "/2")
      if (layer.prefix) req.url = (pathname.slice(found.matched.length) || "/") + queryPart;

      const args = isErrorHandler ? [err, req, res, next] : [req, res, next];
      call(layer.handler, args, next);
    };

    next();
  }

  function add(method, path, handlers, { prefix }) {
    const { regex, keys } = compilePath(path, { prefix });
    for (const handler of handlers.flat()) {
      if (typeof handler !== "function") throw new TypeError(`${method ?? "use"} ${path}: 핸들러가 함수가 아닙니다.`);
      layers.push({ method, regex, keys, prefix, handler });
    }
  }

  for (const method of METHODS) {
    router[method] = (path, ...handlers) => {
      add(method.toUpperCase(), path, handlers, { prefix: false });
      return router;
    };
  }

  router.use = (path, ...handlers) => {
    if (typeof path === "function") add(null, "/", [path, ...handlers], { prefix: true });
    else add(null, path, handlers, { prefix: true });
    return router;
  };

  return router;
}

module.exports = { createRouter };
