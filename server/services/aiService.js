const aiModel = require("../models/aiModel");
const scheduleModel = require("../models/scheduleModel");
const todoModel = require("../models/todoModel");
const subjectModel = require("../models/subjectModel");
const gemini = require("./geminiService");
const withTransaction = require("../utils/transaction");
const HttpError = require("../utils/httpError");
const { ai: aiConfig } = require("../config/env");
const { check, isDate, toDateTime } = require("../utils/validate");
const { parseTitle, parseDescript } = require("../utils/itemInput");
const { kstNow, formatKst } = require("../utils/date");

const SUMMARIZE_AFTER = 20; // AI-007: 요약 안 된 채팅이 이만큼 넘으면
const KEEP_RECENT = 10; //     최근 이만큼만 원문으로 두고 앞부분을 요약한다
const CONTEXT_DAYS = 14; //    AI에게 알려 줄 다가오는 일정 기간
const MAX_PLAN_SCHEDULES = 30;
const MAX_PLAN_TODOS = 15;
const MAX_INPUT_LENGTH = 1000;

const pad = (n) => String(n).padStart(2, "0");
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function todayKst() {
  const { year, month, day } = kstNow();
  const date = `${year}-${pad(month)}-${pad(day)}`;
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return { date, label: `${date} (${weekday})` };
}

// ----- 사용량 (AI-003, NF-010) -----

async function getUsage(userId) {
  const count = await aiModel.findTodayCount(userId);
  return { count, limit: aiConfig.dailyLimit, remaining: Math.max(0, aiConfig.dailyLimit - count) };
}

async function checkQuota(userId) {
  const { count, limit } = await getUsage(userId);
  if (count >= limit) {
    throw new HttpError(429, `오늘 AI 사용 횟수(${limit}회)를 모두 사용했습니다. 내일 다시 이용해 주세요.`);
  }
  if (aiConfig.monthlyTokenLimit > 0 && (await aiModel.sumMonthTokens()) >= aiConfig.monthlyTokenLimit) {
    throw new HttpError(503, "이번 달 AI 사용량을 모두 사용했습니다. 다음 달에 다시 이용해 주세요.");
  }
}

// ----- AI에게 알려 줄 사용자 정보 -----

async function userContext(userId) {
  const today = todayKst();
  const until = new Date(`${today.date}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + CONTEXT_DAYS);

  const [schedules, todos, subjects] = await Promise.all([
    scheduleModel.findRange(userId, {
      from: `${today.date} 00:00:00`,
      to: `${until.toISOString().slice(0, 10)} 00:00:00`,
      limit: 20,
    }),
    todoModel.findAll(userId, { done: false }),
    subjectModel.findAll(),
  ]);

  const scheduleLines = schedules.map((s) => `- ${formatKst(s.date)} ${s.title}`).join("\n") || "- 없음";
  const todoLines = todos.slice(0, 20)
    .map((t) => `- ${t.title}${t.dueDate ? ` (마감 ${formatKst(t.dueDate)})` : ""}`)
    .join("\n") || "- 없음";

  return {
    today,
    subjects,
    text: `오늘: ${today.label}\n\n[앞으로 ${CONTEXT_DAYS}일 일정]\n${scheduleLines}\n\n[완료하지 않은 할 일]\n${todoLines}`,
  };
}

// ----- 대화방 (AI-006) -----

async function findRoomOrThrow(userId, roomId) {
  const room = await aiModel.findRoom(userId, roomId);
  if (!room) throw new HttpError(404, "대화방을 찾을 수 없습니다.");
  return room;
}

// ----- 학습 질문 (AI-005) -----

const CHAT_SYSTEM = `너는 고등학생의 공부를 돕는 학습 도우미 "한울 AI"야.
- 한국어로 친절하고 간결하게 답해. 마크다운 기호(#, **, 표) 없이 평문과 줄바꿈, "- " 목록만 써.
- 개념 질문은 단계적으로 쉽게 설명하고, 학습 방법 질문은 바로 실천할 수 있는 방법을 제안해.
- 사용자의 일정이나 할 일을 물으면 아래 [사용자 정보]만 근거로 답하고, 없는 내용은 지어내지 마.
- 학습 계획표가 필요해 보이면 입력창 왼쪽 + 버튼의 "학습 계획 만들기"를 안내해.`;

async function chat(userId, roomId, message) {
  const text = typeof message === "string" ? message.trim() : "";
  check(text.length > 0 && text.length <= MAX_INPUT_LENGTH, `질문은 1~${MAX_INPUT_LENGTH}자로 입력해 주세요.`);

  const room = await findRoomOrThrow(userId, roomId);
  await checkQuota(userId);

  const context = await userContext(userId);
  const userChat = await aiModel.addChat(room.id, "user", text);
  const recent = await aiModel.findChatsAfter(room.id, room.summaryChatId); // 방금 질문 포함

  let result;
  try {
    result = await gemini.generate({
      system: `${CHAT_SYSTEM}\n\n[사용자 정보]\n${context.text}${room.summary ? `\n\n[이전 대화 요약]\n${room.summary}` : ""}`,
      history: recent.map((c) => ({ role: c.role, text: c.text })),
    });
  } catch (err) {
    await aiModel.deleteChat(userChat.id);
    throw err;
  }

  const aiChat = await aiModel.addChat(room.id, "ai", result.text, result.tokens);
  await aiModel.addUsage(userId, result.tokens);
  await aiModel.touchRoom(room.id);
  await summarizeIfLong(userId, room).catch((err) => console.error("[ai] 요약 실패", err));

  return { userChat, aiChat, usage: await getUsage(userId) };
}

// AI-007: 요약 안 된 채팅이 많아지면 최근 것만 남기고 앞부분을 요약에 합친다.
async function summarizeIfLong(userId, room) {
  const chats = await aiModel.findChatsAfter(room.id, room.summaryChatId);
  if (chats.length <= SUMMARIZE_AFTER) return;

  const old = chats.slice(0, chats.length - KEEP_RECENT);
  const transcript = old.map((c) => `${c.role === "ai" ? "AI" : "학생"}: ${c.text}`).join("\n");
  const result = await gemini.generate({
    system: "너는 대화 요약기야. 이후 대화에 필요한 정보(학생의 목표, 과목, 시험, 어려워하는 부분, 정한 내용) 위주로 한국어 10문장 이내로 요약해.",
    history: [{
      role: "user",
      text: `${room.summary ? `[지금까지의 요약]\n${room.summary}\n\n` : ""}[이어진 대화]\n${transcript}`,
    }],
  });

  await aiModel.updateSummary(room.id, result.text, old.at(-1).id);
  await aiModel.addUsage(userId, result.tokens, { countRequest: false }); // 사용자가 요청한 게 아니라 횟수에는 넣지 않음
}

// ----- 학습 계획 (AI-001, AI-002, AI-004) -----

// 답의 모양. 형식(스키마) 강제 기능은 무료 등급에서 막혀서 지시문에 글로 적고,
// 받은 값은 sanitizePlan으로 한 번 더 거른다.
const PLAN_FORMAT = `반드시 아래 모양의 JSON 하나로만 답해. 다른 글은 쓰지 마.
{
  "summary": "계획의 핵심 2~4문장",
  "schedules": [
    { "title": "과목과 할 내용 (예: 수학 극한 개념 복습)", "date": "YYYY-MM-DD", "time": "HH:mm (24시간, 시작 시각)", "subject": "과목 목록 중 하나, 없으면 빈 문자열" }
  ],
  "todos": [
    { "title": "끝내야 할 과제", "dueDate": "YYYY-MM-DD, 없으면 빈 문자열", "subject": "과목 목록 중 하나, 없으면 빈 문자열" }
  ]
}`;

function planSystem(context) {
  return `너는 고등학생의 학습 계획을 세우는 전문가야.
- 사용자의 시험 일정, 공부 가능 시간, 할 일을 바탕으로 오늘부터 시험 전까지 현실적인 계획을 세워.
- schedules는 실제로 공부할 시간 블록이야. 날짜는 오늘 이후, 시각은 사용자가 말한 공부 가능 시간 안에서만 잡아.
- 시험이 가까운 과목, 할 일이 많은 과목에 시간을 더 배분하고, 시험 전날에는 복습을 넣어.
- todos는 끝내야 할 과제(문제집, 수행평가 준비 등)이고 마감은 시험 전으로 잡아.
- schedules는 최대 ${MAX_PLAN_SCHEDULES}개, todos는 최대 ${MAX_PLAN_TODOS}개.
- subject는 다음 과목 목록 중에서만 골라: ${context.subjects.map((s) => s.name).join(", ")}

${PLAN_FORMAT}

[사용자 정보]
${context.text}`;
}

// AI 응답을 저장 가능한 값만 남긴다.
function sanitizePlan(data) {
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const schedules = (Array.isArray(data?.schedules) ? data.schedules : [])
    .map((s) => ({ title: str(s.title).slice(0, 100), date: str(s.date), time: str(s.time), subject: str(s.subject) || null }))
    .filter((s) => s.title && isDate(s.date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))
    .slice(0, MAX_PLAN_SCHEDULES);
  const todos = (Array.isArray(data?.todos) ? data.todos : [])
    .map((t) => ({ title: str(t.title).slice(0, 100), dueDate: isDate(str(t.dueDate)) ? str(t.dueDate) : null, subject: str(t.subject) || null }))
    .filter((t) => t.title)
    .slice(0, MAX_PLAN_TODOS);
  return { summary: str(data?.summary), schedules, todos };
}

// 대화 기록에 남길 읽기 좋은 글
function planToText(plan) {
  const day = (date) => {
    const [, m, d] = date.split("-");
    return `${Number(m)}/${Number(d)}(${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;
  };
  const scheduleLines = plan.schedules.map((s) => `- ${day(s.date)} ${s.time} ${s.title}`).join("\n") || "- 없음";
  const todoLines = plan.todos.map((t) => `- ${t.title}${t.dueDate ? ` (~${day(t.dueDate)})` : ""}`).join("\n") || "- 없음";
  return `${plan.summary}\n\n[공부 시간표]\n${scheduleLines}\n\n[할 일]\n${todoLines}`;
}

function parseText(value, name) {
  if (value === undefined || value === null) return "";
  check(typeof value === "string" && value.length <= MAX_INPUT_LENGTH, `${name}은 ${MAX_INPUT_LENGTH}자 이하로 입력해 주세요.`);
  return value.trim();
}

async function runPlan(userId, room, requestText, promptText) {
  await checkQuota(userId);
  const context = await userContext(userId);
  const userChat = await aiModel.addChat(room.id, "user", requestText);

  let result;
  try {
    result = await gemini.generate({
      system: planSystem(context),
      history: [{ role: "user", text: promptText }],
      json: true,
    });
  } catch (err) {
    await aiModel.deleteChat(userChat.id);
    throw err;
  }

  const plan = sanitizePlan(result.data);
  const aiChat = await aiModel.addChat(room.id, "ai", planToText(plan), result.tokens);
  await aiModel.addUsage(userId, result.tokens);
  await aiModel.touchRoom(room.id);
  return { roomId: room.id, plan, userChat, aiChat, usage: await getUsage(userId) };
}

// AI-001: { roomId?, exams, availableTime, tasks } — roomId가 없으면 새 대화방을 만든다.
async function createPlan(userId, body) {
  const exams = parseText(body.exams, "시험 일정");
  const availableTime = parseText(body.availableTime, "공부 가능 시간");
  const tasks = parseText(body.tasks, "할 일");
  check(exams || availableTime || tasks, "시험 일정, 공부 가능 시간, 할 일 중 하나 이상 입력해 주세요.");

  let room;
  if (body.roomId !== undefined && body.roomId !== null) {
    room = await findRoomOrThrow(userId, Number(body.roomId));
  } else {
    await checkQuota(userId); // 한도를 넘었으면 빈 대화방을 만들지 않는다
    const { date } = todayKst();
    room = await aiModel.findRoom(userId, await aiModel.createRoom(userId, `학습 계획 (${date.slice(5).replace("-", "/")})`));
  }

  const requestText = `학습 계획을 만들어 줘.\n- 시험 일정: ${exams || "없음"}\n- 공부 가능 시간: ${availableTime || "없음"}\n- 할 일: ${tasks || "없음"}`;
  return runPlan(userId, room, requestText, requestText);
}

// AI-004: { roomId, plan, feedback: "tight" | "loose" | 자유 입력 }
const FEEDBACK_TEXT = {
  tight: "계획이 너무 빡빡해요. 하루 공부량을 줄이고 쉬는 시간을 늘려서 다시 짜 주세요.",
  loose: "계획이 너무 느슨해요. 공부 시간을 늘리고 더 촘촘하게 다시 짜 주세요.",
};

async function regeneratePlan(userId, body) {
  const room = await findRoomOrThrow(userId, Number(body.roomId));
  check(body.plan && typeof body.plan === "object", "이전 계획(plan)을 보내 주세요.");
  const feedback = FEEDBACK_TEXT[body.feedback] ?? parseText(body.feedback, "요청");
  check(feedback, "어떻게 바꿀지 알려 주세요.");

  const previous = sanitizePlan(body.plan);
  const promptText = `아래 이전 계획을 요청에 맞게 다시 만들어 줘.\n\n[이전 계획]\n${planToText(previous)}\n\n[요청]\n${feedback}`;
  return runPlan(userId, room, feedback, promptText);
}

// AI-002: 사용자가 확인·수정한 계획을 일정·To Do로 저장
async function applyPlan(userId, body) {
  const schedules = Array.isArray(body.schedules) ? body.schedules : [];
  const todos = Array.isArray(body.todos) ? body.todos : [];
  check(schedules.length + todos.length > 0, "저장할 일정이나 할 일을 선택해 주세요.");
  check(schedules.length <= MAX_PLAN_SCHEDULES && todos.length <= MAX_PLAN_TODOS, "한 번에 저장할 수 있는 개수를 넘었습니다.");

  const subjectIdByName = new Map((await subjectModel.findAll()).map((s) => [s.name, s.id]));
  const subjectIds = (name) => (subjectIdByName.has(name) ? [subjectIdByName.get(name)] : []);

  const scheduleRows = schedules.map((s) => {
    const date = toDateTime(s.time ? `${s.date}T${s.time}` : s.date);
    check(date, `'${s.title ?? ""}' 일정의 날짜를 확인해 주세요.`);
    return { title: parseTitle(s.title), descript: parseDescript(s.descript), date, subjectIds: subjectIds(s.subject) };
  });
  const todoRows = todos.map((t) => {
    const dueDate = t.dueDate ? toDateTime(t.dueDate) : null;
    check(!t.dueDate || dueDate, `'${t.title ?? ""}' 할 일의 마감일을 확인해 주세요.`);
    return { title: parseTitle(t.title), descript: parseDescript(t.descript), dueDate, subjectIds: subjectIds(t.subject) };
  });

  await withTransaction(async (conn) => {
    for (const s of scheduleRows) {
      const id = await scheduleModel.create(conn, { userId, title: s.title, descript: s.descript, date: s.date });
      await subjectModel.replaceLinked(conn, "schedule", id, s.subjectIds);
    }
    for (const t of todoRows) {
      const id = await todoModel.create(conn, { userId, title: t.title, descript: t.descript, dueDate: t.dueDate });
      await subjectModel.replaceLinked(conn, "todo", id, t.subjectIds);
    }
  });
  return { schedules: scheduleRows.length, todos: todoRows.length };
}

module.exports = { getUsage, findRoomOrThrow, chat, createPlan, regeneratePlan, applyPlan };
