const { GoogleGenAI, ApiError } = require("@google/genai");
const { ai: aiConfig } = require("../config/env");
const HttpError = require("../utils/httpError");

let client = null;

function getClient() {
  if (!aiConfig.apiKey) throw new HttpError(503, "AI 기능이 아직 설정되지 않았습니다. (GEMINI_API_KEY)");
  client ??= new GoogleGenAI({ apiKey: aiConfig.apiKey });
  return client;
}

// Gemini 에러를 사용자에게 보여줄 에러로 바꾼다.
function toHttpError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof ApiError && err.status === 429) {
    return new HttpError(429, "AI 무료 사용량이 잠시 초과되었습니다. 1분 뒤에 다시 시도해 주세요.");
  }
  if (err instanceof ApiError && err.status === 503) {
    return new HttpError(503, "지금 AI 사용자가 많아 답변하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  console.error("[gemini]", err);
  return new HttpError(502, "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

const MAX_TOOL_STEPS = 3; // 도구 호출 → 결과 전달을 최대 몇 번 주고받을지

// history: [{ role: "user" | "ai", text }] (오래된 → 최신)
// json이 true면 JSON으로만 답하게 하고, 파싱한 객체를 data로 돌려준다. (모양은 system에 적는다)
// tools: { declarations: [FunctionDeclaration], handlers: { 이름: async (args) => 결과 객체 } }
//   AI가 도구를 부르면 handler를 실행하고 결과를 AI에게 돌려줘서 최종 답을 받는다.
//   AI는 호출 요청만 만들고, 실제 실행(검증·저장)은 handler(서버)가 한다.
// 반환: { text, data?, tokens }
async function generate({ system, history, json = false, tools = null }) {
  const contents = history.map(({ role, text }) => ({
    role: role === "ai" ? "model" : "user",
    parts: [{ text }],
  }));
  const config = {
    systemInstruction: system,
    // 형식(스키마) 지정은 무료 등급에서 계속 503이 나서, JSON 응답만 지정하고 모양은 system에 글로 적는다.
    ...(json && { responseMimeType: "application/json" }),
    ...(tools && { tools: [{ functionDeclarations: tools.declarations }] }),
  };

  // 무료 등급은 분당 요청 수가 적어서(예: 5회) 실패해도 자동으로 다시 시도하지 않는다.
  let response;
  let tokens = 0;
  for (let step = 0; ; step++) {
    try {
      response = await getClient().models.generateContent({ model: aiConfig.model, contents, config });
    } catch (err) {
      throw toHttpError(err);
    }
    tokens += response.usageMetadata?.totalTokenCount ?? 0;

    const calls = response.functionCalls ?? [];
    if (!tools || calls.length === 0 || step >= MAX_TOOL_STEPS) break;

    // AI의 호출 요청을 그대로 기록에 남기고(thought signature 포함), 실행 결과를 이어 붙인다.
    contents.push(response.candidates[0].content);
    const parts = [];
    for (const call of calls) {
      const handler = tools.handlers[call.name];
      let result;
      try {
        result = handler ? await handler(call.args ?? {}) : { error: "없는 기능입니다." };
      } catch (err) {
        result = { error: err instanceof HttpError ? err.message : "처리하지 못했습니다." };
        if (!(err instanceof HttpError)) console.error(`[gemini] ${call.name}`, err);
      }
      parts.push({ functionResponse: { id: call.id, name: call.name, response: result } });
    }
    contents.push({ role: "user", parts });
  }

  const text = response.text ?? "";
  if (!text) throw new HttpError(502, "AI가 답변을 만들지 못했습니다. 질문을 바꿔 다시 시도해 주세요.");

  if (!json) return { text, tokens };
  try {
    return { text, data: JSON.parse(text), tokens };
  } catch {
    throw new HttpError(502, "AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.");
  }
}

module.exports = { generate };
