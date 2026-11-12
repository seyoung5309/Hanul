const aiModel = require("../models/aiModel");
const aiService = require("../services/aiService");
const HttpError = require("../utils/httpError");
const { check } = require("../utils/validate");
const { parseId } = require("../utils/itemInput");

const MAX_ROOM_TITLE = 50;

// 오늘 사용량 가져오기 { count, limit, remaining }
async function getUsage(req, res) {
  res.json(await aiService.getUsage(req.user.id));
}

// 대화방 목록 (최근 대화 순)
async function getRooms(req, res) {
  res.json(await aiModel.findRooms(req.user.id));
}

// 새 대화방 생성 { title? }
async function createRoom(req, res) {
  let title =
    typeof req.body.title == "string" && req.body.title.trim()
      ? req.body.title.trim()
      : "새 대화"; // 대화방이 존재하면 그 대화방 제목으로, 없으면 새 대화

  check(
    title.length <= MAX_ROOM_TITLE,
    `제목은 ${MAX_ROOM_TITLE}자 이하로 입력해 주세요.`,
  );

  let id = await aiModel.createRoom(req.user.id, title);
  res.status(201).json(await aiModel.findRoom(req.user.id, id));
}

// 이전 대화 이어가기
async function getRoom(req, res) {
  let room = await aiService.findRoomOrThrow(
    req.user.id,
    parseId(req.params.aiRoomId, "aiRoomId"),
  );

  res.json({ ...room, chats: await aiModel.findChats(room.id) });
}

// 대화방 삭제하기
async function deleteRoom(req, res) {
  let id = parseId(req.params.aiRoomId, "aiRoomId");

  if ((await aiModel.deleteRoom(req.user.id, id)) === 0) {
    throw new HttpError(404, "대화방을 찾을 수 없습니다.");
  }

  res.status(204).end();
}

// 채팅 { message } -> { userChat, aiChat, usage }
async function chat(req, res) {
  res
    .status(201)
    .json(
      await aiService.chat(
        req.user.id,
        parseId(req.params.aiRoomId, "aiRoomId"),
        req.body.message,
      ),
    );
}

// 일정 혹은 To Do 생성 { roomId?, exams, availableTime, tasks } -> { roomId, plan, userChat, aiChat, usage }
async function createPlan(req, res) {
  res.status(201).json(await aiService.createPlan(req.user.id, req.body));
}

// 일정 혹은 To Do 다시 계획하기 { roomId, plan, feedback: "tight" | "loose" | 자유 입력 }
async function regeneratePlan(req, res) {
  res.status(201).json(await aiService.regeneratePlan(req.user.id, req.body));
}

// 일정 혹은 To Do를 DB에 넣어 저장 { schedules: [{ title, date, time?, subject? }], todos: [{ title, dueDate?, subject? }] }
async function applyPlan(req, res) {
  res.status(201).json(await aiService.applyPlan(req.user.id, req.body));
}

module.exports = {
  getUsage,
  getRooms,
  createRoom,
  getRoom,
  deleteRoom,
  chat,
  createPlan,
  regeneratePlan,
  applyPlan,
};
