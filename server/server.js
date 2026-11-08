const http = require("http");
const { port } = require("./config/env");
const app = require("./app");
const { initSocket } = require("./socket");
const startJobs = require("./jobs");

// Express(REST)와 Socket.IO(실시간)가 같은 포트를 함께 쓴다.
const server = http.createServer(app);
initSocket(server);
startJobs();

server.listen(port, () => {
  console.log(`서버 실행: http://localhost:${port}`);
});
