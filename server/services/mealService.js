const { nice } = require("../config/env");
const HttpError = require("../utils/httpError");

// NEIS 교육정보 개방 포털 (https://open.neis.go.kr)
const NEIS_URL = "https://open.neis.go.kr/hub";
const CACHE_MS = 60 * 60 * 1000; // 날짜가 같으면 1시간동안 안물음
const TIMEOUT_MS = 5000;
const MEAL_TYPES = { 1: "breakfast", 2: "lunch", 3: "dinner" };

let school = null; // { officeCode, schoolCode, name }
const cache = new Map(); // "YYYY-MM-DD" → { expires, value }

// NEIS API 호출. 데이터가 없으면 빈 배열
async function neis(service, params) {
  if (!nice.apiKey) {
    throw new HttpError(
      503,
      "급식 API 키가 설정되지 않았습니다. (NICE_API_KEY)",
    );
  }

  let url = new URL(`${NEIS_URL}/${service}`);

  url.search = new URLSearchParams({
    KEY: nice.apiKey,
    Type: "json",
    pIndex: "1",
    pSize: "100",
    ...params,
  });

  let data;

  try {
    let res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    data = await res.json();
  } catch (err) {
    console.error("[neis]", err.message);
    throw new HttpError(
      502,
      "급식 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  // 결과가 없거나 오류면 { RESULT: { CODE, MESSAGE } } 형태로
  if (data.RESULT) {
    if (data.RESULT.CODE === "INFO-200") {
      return []; // 해당하는 데이터가 없음
    }

    console.error("[neis]", data.RESULT.CODE, data.RESULT.MESSAGE);

    throw new HttpError(
      502,
      "급식 정보를 불러오지 못했습니다. (NEIS 응답 오류)",
    );
  }

  return data[service]?.[1]?.row ?? [];
}

// 학교 코드로 찾기
async function resolveSchool() {
  if (school) {
    return school;
  }

  if (nice.officeCode && nice.schoolCode) {
    school = {
      officeCode: nice.officeCode,
      schoolCode: nice.schoolCode,
      name: nice.schoolName,
    };
    return school;
  }

  let rows = await neis("schoolInfo", { SCHUL_NM: nice.schoolName });
  let found = rows.find((row) => row.SCHUL_NM === nice.schoolName) ?? rows[0];

  if (!found) {
    throw new HttpError(
      502,
      `학교 정보를 찾지 못했습니다. (${nice.schoolName})`,
    );
  }

  school = {
    officeCode: found.ATPT_OFCDC_SC_CODE,
    schoolCode: found.SD_SCHUL_CODE,
    name: found.SCHUL_NM,
  };

  console.log(
    `[neis] 학교 코드: ${school.name} ${school.officeCode}/${school.schoolCode}`,
  );

  return school;
}

// 메뉴 끝에 붙는 이상한 거 지우기
let TRAILING_MARK =
  /\s*(?:\((?:[\d.,\s]+|[a-zA-Z])\)|(?:\d{1,2}\.)+\d{0,2})\s*$/;

// "현미밥(j)<br/>깍두기(조식) (9)" → ["현미밥", "깍두기(조식)"]
function parseMenu(dishes) {
  return String(dishes ?? "")
    .split(/<br\s*\/?>/i)
    .map((dish) => {
      let text = dish.trim();
      while (TRAILING_MARK.test(text)) text = text.replace(TRAILING_MARK, "");
      return text.trim();
    })
    .filter(Boolean);
}

// date: "YYYY-MM-DD" → { date, school, meals: { breakfast?, lunch?, dinner? } }
// 예시: { name: "중식", menu: [...], calories: "812.5 Kcal" }
async function getMeals(date) {
  let cached = cache.get(date);

  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  let { officeCode, schoolCode, name } = await resolveSchool();

  let rows = await neis("mealServiceDietInfo", {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
    MLSV_YMD: date.replaceAll("-", ""),
  });

  const meals = {};

  for (let row of rows) {
    let type = MEAL_TYPES[row.MMEAL_SC_CODE];
    if (type) {
      meals[type] = {
        name: row.MMEAL_SC_NM,
        menu: parseMenu(row.DDISH_NM),
        calories: row.CAL_INFO ?? null,
      };
    }
  }

  let value = { date, school: name, meals };
  cache.set(date, { expires: Date.now() + CACHE_MS, value });
  return value;
}

module.exports = { getMeals, parseMenu };
