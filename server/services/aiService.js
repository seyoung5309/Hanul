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

const SUMMARIZE_AFTER = 20;
const KEEP_RECENT = 10; //     최근 10개까지만 원문으로 하고 나머지는 요약
const CONTEXT_DAYS = 14; //    2주 내에 있는 할 일이나 To Do 같은 거
const MAX_PLAN_SCHEDULES = 30;
const MAX_PLAN_TODOS = 15;
const MAX_INPUT_LENGTH = 1000;

const pad = (n) => String(n).padStart(2, "0");
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 날짜 형식 변환
function todayKst() {
  let { year, month, day } = kstNow();
  let date = `${year}-${pad(month)}-${pad(day)}`;
  let weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return { date, label: `${date} (${weekday})` };
}

// 사용량 불러오기 (20 제한)
async function getUsage(userId) {
  let count = await aiModel.findTodayCount(userId);
  return {
    count,
    limit: aiConfig.dailyLimit,
    remaining: Math.max(0, aiConfig.dailyLimit - count),
  };
}

// 사용량 체크 하기
async function checkQuota(userId) {
  let { count, limit } = await getUsage(userId);

  if (count >= limit) {
    throw new HttpError(
      429,
      `오늘 AI 사용 횟수(${limit}회)를 모두 사용했습니다. 내일 다시 이용해 주세요.`,
    );
  }

  if (
    aiConfig.monthlyTokenLimit > 0 &&
    (await aiModel.sumMonthTokens()) >= aiConfig.monthlyTokenLimit
  ) {
    throw new HttpError(
      503,
      "이번 달 AI 사용량을 모두 사용했습니다. 다음 달에 다시 이용해 주세요.",
    );
  }
}

// 사용자에 대하여 알려줄 정보
async function userContext(userId) {
  let today = todayKst();
  let until = new Date(`${today.date}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + CONTEXT_DAYS);

  let [schedules, todos, subjects] = await Promise.all([
    scheduleModel.findRange(userId, {
      from: `${today.date} 00:00:00`,
      to: `${until.toISOString().slice(0, 10)} 00:00:00`,
      limit: 20,
    }),
    todoModel.findAll(userId, { done: false }),
    subjectModel.findAll(),
  ]);

  let scheduleLines =
    schedules.map((s) => `- ${formatKst(s.date)} ${s.title}`).join("\n") ||
    "- 없음";

  let todoLines =
    todos
      .slice(0, 20)
      .map(
        (t) =>
          `- ${t.title}${t.dueDate ? ` (마감 ${formatKst(t.dueDate)})` : ""}`,
      )
      .join("\n") || "- 없음";

  return {
    today,
    subjects,
    text: `오늘: ${today.label}\n\n[앞으로 ${CONTEXT_DAYS}일 일정]\n${scheduleLines}\n\n[완료하지 않은 할 일]\n${todoLines}`,
  };
}

// 대화방 찾기
async function findRoomOrThrow(userId, roomId) {
  const room = await aiModel.findRoom(userId, roomId);

  if (!room) {
    throw new HttpError(404, "대화방을 찾을 수 없습니다.");
  }

  return room;
}

// 질문 프롬프트
const CHAT_SYSTEM = `너는 고등학생의 공부를 돕는 학습 도우미 "한울 AI"야.
- 한국어로 친절하고 간결하게 답해. 마크다운 기호(#, **, 표) 없이 평문과 줄바꿈, "- " 목록만 써.
- 개념 질문은 단계적으로 쉽게 설명하고, 학습 방법 질문은 바로 실천할 수 있는 방법을 제안해.
- 사용자의 일정이나 할 일을 물으면 아래 [사용자 정보]만 근거로 답하고, 없는 내용은 지어내지 마.
- 너는 add_schedules(일정 추가), add_todos(할 일 추가) 기능으로 사용자의 달력과 To Do에 직접 추가할 수 있어.
  - 사용자가 추가, 등록, 넣어 달라고 하거나, 네가 제안한 일정을 추가하는 데 동의하면 바로 호출해.
  - 일정을 짜 달라고만 하면 먼저 일정을 제안하고, 마지막에 "이대로 일정에 추가할까?"라고 물어봐.
  - 날짜는 [사용자 정보]의 오늘을 기준으로 계산해 (내일, 이번 주 금요일 등). 쉬는 시간·식사는 일정에 넣지 마.
  - 추가한 뒤에는 무엇을 언제로 추가했는지 짧게 알려 줘. 실패하면 이유를 알려 주고, 추가했다고 말하지 마.
- 학습 계획표가 필요해 보이면 입력창 왼쪽 + 버튼의 "학습 계획 만들기"를 안내해.`;

// 채팅 보내기
async function chat(userId, roomId, message) {
  let text = typeof message === "string" ? message.trim() : "";

  check(
    text.length > 0 && text.length <= MAX_INPUT_LENGTH,
    `질문은 1~${MAX_INPUT_LENGTH}자로 입력해 주세요.`,
  );

  let room = await findRoomOrThrow(userId, roomId);

  await checkQuota(userId);

  let context = await userContext(userId);
  let userChat = await aiModel.addChat(room.id, "user", text);
  let recent = await aiModel.findChatsAfter(room.id, room.summaryChatId); // 방금 질문 포함
  let added = { schedules: [], todos: [] };
  let result;

  try {
    result = await gemini.generate({
      system: `${CHAT_SYSTEM}\n\n[사용자 정보]\n${context.text}${room.summary ? `\n\n[이전 대화 요약]\n${room.summary}` : ""}`,
      history: recent.map((c) => ({ role: c.role, text: c.text })),
      tools: {
        declarations: chatToolDeclarations(context.subjects),
        handlers: chatToolHandlers(userId, added),
      },
    });
  } catch (err) {
    await aiModel.deleteChat(userChat.id);
    throw err;
  }

  let aiChat = await aiModel.addChat(room.id, "ai", result.text, result.tokens);

  await aiModel.addUsage(userId, result.tokens);
  await aiModel.touchRoom(room.id);
  await summarizeIfLong(userId, room).catch((err) =>
    console.error("[ai] 요약 실패", err),
  );

  return { userChat, aiChat, added, usage: await getUsage(userId) };
}

// 앞 부분만 남기고 나머지는 요약
async function summarizeIfLong(userId, room) {
  let chats = await aiModel.findChatsAfter(room.id, room.summaryChatId);

  if (chats.length <= SUMMARIZE_AFTER) {
    return;
  }

  let old = chats.slice(0, chats.length - KEEP_RECENT);
  let transcript = old
    .map((c) => `${c.role === "ai" ? "AI" : "학생"}: ${c.text}`)
    .join("\n");

  let result = await gemini.generate({
    system:
      "너는 대화 요약기야. 이후 대화에 필요한 정보(학생의 목표, 과목, 시험, 어려워하는 부분, 정한 내용) 위주로 한국어 10문장 이내로 요약해.",
    history: [
      {
        role: "user",
        text: `${room.summary ? `[지금까지의 요약]\n${room.summary}\n\n` : ""}[이어진 대화]\n${transcript}`,
      },
    ],
  });

  await aiModel.updateSummary(room.id, result.text, old.at(-1).id);
  await aiModel.addUsage(userId, result.tokens, { countRequest: false }); // 사용자가 한 질문이 아니니까 체크 안함.
}

// 학습 계획 함수 요청 형식
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

// 학습 계획 세우기
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

// AI 응답을 저장 가능한 값만
function sanitizePlan(data) {
  let str = (v) => (typeof v === "string" ? v.trim() : "");

  let schedules = (Array.isArray(data?.schedules) ? data.schedules : [])
    .map((s) => ({
      title: str(s.title).slice(0, 100),
      date: str(s.date),
      time: str(s.time),
      subject: str(s.subject) || null,
    }))
    .filter(
      (s) =>
        s.title && isDate(s.date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time),
    )
    .slice(0, MAX_PLAN_SCHEDULES);

  let todos = (Array.isArray(data?.todos) ? data.todos : [])
    .map((t) => ({
      title: str(t.title).slice(0, 100),
      dueDate: isDate(str(t.dueDate)) ? str(t.dueDate) : null,
      subject: str(t.subject) || null,
    }))
    .filter((t) => t.title)
    .slice(0, MAX_PLAN_TODOS);

  return { summary: str(data?.summary), schedules, todos };
}

// 대화 기록에 남길 읽기 좋은 글
function planToText(plan) {
  let day = (date) => {
    let [, m, d] = date.split("-");
    return `${Number(m)}/${Number(d)}(${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;
  };

  let scheduleLines =
    plan.schedules
      .map((s) => `- ${day(s.date)} ${s.time} ${s.title}`)
      .join("\n") || "- 없음";

  let todoLines =
    plan.todos
      .map((t) => `- ${t.title}${t.dueDate ? ` (~${day(t.dueDate)})` : ""}`)
      .join("\n") || "- 없음";

  return `${plan.summary}\n\n[공부 시간표]\n${scheduleLines}\n\n[할 일]\n${todoLines}`;
}

// 사용자 입력 글 유효성 체크
function parseText(value, name) {
  if (value === undefined || value === null) {
    return "";
  }

  check(
    typeof value === "string" && value.length <= MAX_INPUT_LENGTH,
    `${name}은 ${MAX_INPUT_LENGTH}자 이하로 입력해 주세요.`,
  );

  return value.trim();
}

// gemini로 계획 만들어서 DB 저장
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
  const aiChat = await aiModel.addChat(
    room.id,
    "ai",
    planToText(plan),
    result.tokens,
  );
  await aiModel.addUsage(userId, result.tokens);
  await aiModel.touchRoom(room.id);
  return {
    roomId: room.id,
    plan,
    userChat,
    aiChat,
    usage: await getUsage(userId),
  };
}

// 새 대화방 생성
async function createPlan(userId, body) {
  let exams = parseText(body.exams, "시험 일정");
  let availableTime = parseText(body.availableTime, "공부 가능 시간");
  let tasks = parseText(body.tasks, "할 일");

  check(
    exams || availableTime || tasks,
    "시험 일정, 공부 가능 시간, 할 일 중 하나 이상 입력해 주세요.",
  );

  let room;
  if (body.roomId !== undefined && body.roomId !== null) {
    room = await findRoomOrThrow(userId, Number(body.roomId));
  } else {
    await checkQuota(userId); // 한도를 넘었으면 빈 대화방을 만들지 않는다
    let { date } = todayKst();
    room = await aiModel.findRoom(
      userId,
      await aiModel.createRoom(
        userId,
        `학습 계획 (${date.slice(5).replace("-", "/")})`,
      ),
    );
  }

  let requestText = `학습 계획을 만들어 줘.\n- 시험 일정: ${exams || "없음"}\n- 공부 가능 시간: ${availableTime || "없음"}\n- 할 일: ${tasks || "없음"}`;
  return runPlan(userId, room, requestText, requestText);
}

//
const FEEDBACK_TEXT = {
  tight:
    "계획이 너무 빡빡해요. 하루 공부량을 줄이고 쉬는 시간을 늘려서 다시 짜 주세요.",
  loose: "계획이 너무 느슨해요. 공부 시간을 늘리고 더 촘촘하게 다시 짜 주세요.",
};

// 계획 새로 구상하기
async function regeneratePlan(userId, body) {
  let room = await findRoomOrThrow(userId, Number(body.roomId));

  check(
    body.plan && typeof body.plan === "object",
    "이전 계획(plan)을 보내 주세요.",
  );

  let feedback =
    FEEDBACK_TEXT[body.feedback] ?? parseText(body.feedback, "요청");

  check(feedback, "어떻게 바꿀지 알려 주세요.");

  let previous = sanitizePlan(body.plan);
  let promptText = `아래 이전 계획을 요청에 맞게 다시 만들어 줘.\n\n[이전 계획]\n${planToText(previous)}\n\n[요청]\n${feedback}`;

  return runPlan(userId, room, feedback, promptText);
}

// 일정이나 To Do 저장
async function applyPlan(userId, body) {
  let schedules = Array.isArray(body.schedules) ? body.schedules : [];
  let todos = Array.isArray(body.todos) ? body.todos : [];

  check(
    schedules.length + todos.length > 0,
    "저장할 일정이나 할 일을 선택해 주세요.",
  );

  check(
    schedules.length <= MAX_PLAN_SCHEDULES && todos.length <= MAX_PLAN_TODOS,
    "한 번에 저장할 수 있는 개수를 넘었습니다.",
  );

  return saveItems(userId, { schedules, todos });
}

// 값 유효성이나 그런거 검증하기
async function saveItems(userId, { schedules = [], todos = [] }) {
  let subjectIdByName = new Map(
    (await subjectModel.findAll()).map((s) => [s.name, s.id]),
  );

  let subjectIds = (name) =>
    subjectIdByName.has(name) ? [subjectIdByName.get(name)] : [];

  let scheduleRows = schedules.map((s) => {
    let date = toDateTime(s.time ? `${s.date}T${s.time}` : s.date);
    check(date, `'${s.title ?? ""}' 일정의 날짜를 확인해 주세요.`);
    return {
      title: parseTitle(s.title),
      descript: parseDescript(s.descript),
      date,
      subjectIds: subjectIds(s.subject),
    };
  });

  let todoRows = todos.map((t) => {
    let dueDate = t.dueDate ? toDateTime(t.dueDate) : null;
    check(
      !t.dueDate || dueDate,
      `'${t.title ?? ""}' 할 일의 마감일을 확인해 주세요.`,
    );

    return {
      title: parseTitle(t.title),
      descript: parseDescript(t.descript),
      dueDate,
      subjectIds: subjectIds(t.subject),
    };
  });

  await withTransaction(async (conn) => {
    for (let s of scheduleRows) {
      let id = await scheduleModel.create(conn, {
        userId,
        title: s.title,
        descript: s.descript,
        date: s.date,
      });
      await subjectModel.replaceLinked(conn, "schedule", id, s.subjectIds);
    }

    for (let t of todoRows) {
      let id = await todoModel.create(conn, {
        userId,
        title: t.title,
        descript: t.descript,
        dueDate: t.dueDate,
      });
      await subjectModel.replaceLinked(conn, "todo", id, t.subjectIds);
    }
  });

  return { schedules: scheduleRows.length, todos: todoRows.length };
}

// AI가 쓸 수 있는 함수

const MAX_TOOL_ITEMS = 10;

const subjectProp = (subjects) => ({
  type: "STRING",
  description: `과목. 다음 중 하나, 맞는 게 없으면 빈 문자열: ${subjects.map((s) => s.name).join(", ")}`,
});

function chatToolDeclarations(subjects) {
  return [
    {
      name: "add_schedules",
      description:
        "사용자의 일정(달력)에 일정을 추가한다. 특정 날짜·시각에 하는 일(공부 시간, 시험, 수행평가 등).",
      parameters: {
        type: "OBJECT",
        properties: {
          items: {
            type: "ARRAY",
            description: `추가할 일정 목록 (최대 ${MAX_TOOL_ITEMS}개)`,
            items: {
              type: "OBJECT",
              properties: {
                title: {
                  type: "STRING",
                  description: "일정 제목 (30자 이내, 예: DB 수행평가 준비)",
                },
                date: { type: "STRING", description: "날짜 YYYY-MM-DD" },
                time: {
                  type: "STRING",
                  description:
                    "시작 시각 HH:mm (24시간). 시각이 없으면 빈 문자열",
                },
                subject: subjectProp(subjects),
              },
              required: ["title", "date"],
            },
          },
        },
        required: ["items"],
      },
    },
    {
      name: "add_todos",
      description:
        "사용자의 할 일(To Do) 목록에 할 일을 추가한다. 끝내야 하는 과제(문제집 풀기, 보고서 작성 등).",
      parameters: {
        type: "OBJECT",
        properties: {
          items: {
            type: "ARRAY",
            description: `추가할 할 일 목록 (최대 ${MAX_TOOL_ITEMS}개)`,
            items: {
              type: "OBJECT",
              properties: {
                title: {
                  type: "STRING",
                  description: "할 일 제목 (30자 이내)",
                },
                descript: {
                  type: "STRING",
                  description: "세부 내용. 없으면 빈 문자열",
                },
                dueDate: {
                  type: "STRING",
                  description: "마감 날짜 YYYY-MM-DD. 없으면 빈 문자열",
                },
                subject: subjectProp(subjects),
              },
              required: ["title"],
            },
          },
        },
        required: ["items"],
      },
    },
  ];
}

function toolItems(args) {
  let items = Array.isArray(args.items) ? args.items : [];

  check(items.length > 0, "추가할 항목이 없습니다.");

  check(
    items.length <= MAX_TOOL_ITEMS,
    `한 번에 ${MAX_TOOL_ITEMS}개까지 추가할 수 있습니다.`,
  );

  return items.map((item) =>
    Object.fromEntries(
      Object.entries(item).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ]),
    ),
  );
}

// 추가한 항목
function chatToolHandlers(userId, added) {
  return {
    async add_schedules(args) {
      let schedules = toolItems(args).map((s) => ({
        ...s,
        time: s.time || "",
        subject: s.subject || null,
      }));
      await saveItems(userId, { schedules });
      added.schedules.push(
        ...schedules.map(({ title, date, time }) => ({
          title,
          date,
          time: time || null,
        })),
      );
      return { result: `일정 ${schedules.length}개를 추가했습니다.` };
    },
    async add_todos(args) {
      let todos = toolItems(args).map((t) => ({
        ...t,
        dueDate: t.dueDate || null,
        subject: t.subject || null,
      }));
      await saveItems(userId, { todos });
      added.todos.push(
        ...todos.map(({ title, dueDate }) => ({ title, dueDate })),
      );
      return { result: `할 일 ${todos.length}개를 추가했습니다.` };
    },
  };
}

module.exports = {
  getUsage,
  findRoomOrThrow,
  chat,
  createPlan,
  regeneratePlan,
  applyPlan,
};
