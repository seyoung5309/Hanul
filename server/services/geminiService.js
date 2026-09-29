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

// history: [{ role: "user" | "ai", text }] (오래된 → 최신)
// json이 true면 JSON으로만 답하게 하고, 파싱한 객체를 data로 돌려준다. (모양은 system에 적는다)
// 반환: { text, data?, tokens }
async function generate({ system, history, json = false }) {
  const contents = history.map(({ role, text }) => ({
    role: role === "ai" ? "model" : "user",
    parts: [{ text }],
  }));

  // 무료 등급은 분당 요청 수가 적어서(예: 5회) 실패해도 자동으로 다시 시도하지 않는다.
  let response;
  try {
    response = await getClient().models.generateContent({
      model: aiConfig.model,
      contents,
      config: {
        systemInstruction: system,
        // 형식(스키마) 지정은 무료 등급에서 계속 503이 나서, JSON 응답만 지정하고 모양은 system에 글로 적는다.
        ...(json && { responseMimeType: "application/json" }),
      },
    });
  } catch (err) {
    throw toHttpError(err);
  }

  const text = response.text ?? "";
  const tokens = response.usageMetadata?.totalTokenCount ?? 0;
  if (!text) throw new HttpError(502, "AI가 답변을 만들지 못했습니다. 질문을 바꿔 다시 시도해 주세요.");

  if (!json) return { text, tokens };
  try {
    return { text, data: JSON.parse(text), tokens };
  } catch {
    throw new HttpError(502, "AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.");
  }
}

module.exports = { generate };
