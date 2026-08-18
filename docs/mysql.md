# 사용자

## auth (계정)

| 속성명     | 자료형       | 제약 조건                   | 설명                 |
| ---------- | ------------ | --------------------------- | -------------------- |
| id         | INTEGER      | PRIMARY KEY, AUTO_INCREMENT | 사용자 ID            |
| email      | VARCHAR(255) | NOT NULL, UNIQUE            | 사용자 이메일        |
| password   | VARCHAR(255) | NOT NULL                    | 사용자 비밀번호      |
| created_at | DATETIME     | DEFAULT CURRENT_TIMESTAMP   | 사용자 회원가입 날짜 |

## user (프로필)

| 속성명     | 자료형       | 제약 조건                | 설명              |
| ---------- | ------------ | ------------------------ | ----------------- |
| id         | INTEGER      | PRIMARY KEY, FOREIGN KEY | 사용자 ID         |
| identifier | VARCHAR(16)  | UNIQUE, NOT NULL         | 아이디            |
| name       | VARCHAR(16)  | NOT NULL                 | 이름              |
| gender     | BOOLEAN      | NOT NULL                 | 성별 (0=남, 1=여) |
| img        | VARCHAR(255) |                          | 이미지 경로       |
| comment    | VARCHAR(255) |                          | 한 마디           |
| start_year | YEAR         | NOT NULL                 | 입학연도          |

FOREIGN KEY (id) REFERENCES auth(id)
ON DELETE CASCADE
ON UPDATE CASCADE

## time (공부 시간)

| 속성명              | 자료형  | 제약 조건   | 설명                              |
| ------------------- | ------- | ----------- | --------------------------------- |
| id                  | INTEGER | FOREIGN KEY | 사용자 ID                         |
| total               | INTEGER | 단위: 초    | 총 합 공부 시간                   |
| month               | INTEGER | 단위: 초    | 이번 달 공부 시간                 |
| week                | INTEGER | 단위: 초    | 이번 주 공부 시간                 |
| day                 | INTEGER | 단위: 초    | 오늘의 공부 시간                  |
| last_day_reset_at   | DATE    |             | day 값을 마지막으로 리셋한 날짜   |
| last_week_reset_at  | DATE    |             | week 값을 마지막으로 리셋한 날짜  |
| last_month_reset_at | DATE    |             | month 값을 마지막으로 리셋한 날짜 |

FOREIGN KEY (id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

- cron과 lazy check가 리셋 여부를 판단하는 기준값. `IF last_day_reset_at < 오늘` 조건으로 중복 리셋도 자연스럽게 방지됨.

## time_log (기간별 공부 시간 스냅샷)

| 속성명       | 자료형                       | 제약 조건                   | 설명                                 |
| ------------ | ---------------------------- | --------------------------- | ------------------------------------ |
| id           | INTEGER                      | PRIMARY KEY, AUTO_INCREMENT | ID                                   |
| user_id      | INTEGER                      | FOREIGN KEY                 | 사용자 ID                            |
| status       | ENUM('day', 'week', 'month') | NOT NULL                    | 어떤 주기가 초기화되며 남긴 기록인지 |
| amount       | INTEGER                      | NOT NULL                    | 초기화 직전 누적 시간 (초)           |
| period_start | DATE                         | NOT NULL                    | 해당 주기 시작일                     |
| period_end   | DATE                         | NOT NULL                    | 해당 주기 종료일                     |
| created_at   | DATETIME                     | DEFAULT CURRENT_TIMESTAMP   | 기록 생성 시각                       |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

- `total`은 누적값이라 초기화 대상이 아니므로 status에서 제외.

## class (학년/반)

| 속성명 | 자료형  | 제약 조건                   | 설명              |
| ------ | ------- | --------------------------- | ----------------- |
| id     | INTEGER | PRIMARY KEY, AUTO_INCREMENT | ID                |
| grade  | INTEGER | NOT NULL                    | 몇 학년           |
| class  | INTEGER | NOT NULL                    | 몇 반             |
| year   | YEAR    | NOT NULL                    | 학년도 (예: 2026) |

`UNIQUE (year, grade, class)`

## class_user (반에 속한 학생)

| 속성명   | 자료형  | 제약 조건                   | 설명       |
| -------- | ------- | --------------------------- | ---------- |
| id       | INTEGER | PRIMARY KEY, AUTO_INCREMENT | ID         |
| class_id | INTEGER | FOREIGN KEY                 | 학년/반 ID |
| user_id  | INTEGER | FOREIGN KEY                 | 사용자 ID  |
| number   | INTEGER | NOT NULL                    | 번호       |

FOREIGN KEY (class_id) REFERENCES class(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

`UNIQUE (user_id, class_id)`

- 진급 시 예전 row는 지우지 않고 새 학년도의 `class_id`로 row만 추가.
- "현재 반"은 `class.year = 현재 학년도`로 조회.

---

# 공부방

## study_room (생성된 공부방)

| 속성명     | 자료형       | 제약 조건                   | 설명                      |
| ---------- | ------------ | --------------------------- | ------------------------- |
| id         | INTEGER      | PRIMARY KEY, AUTO_INCREMENT | 공부방 ID                 |
| title      | VARCHAR(255) | NOT NULL                    | 제목                      |
| comment    | VARCHAR(255) |                             | 설명                      |
| room_code  | VARCHAR(6)   | UNIQUE, NOT NULL            | 영문+숫자 6자리 초대 코드 |
| creator    | INTEGER      | FOREIGN KEY                 | 방장                      |
| created_at | DATETIME     | DEFAULT CURRENT_TIMESTAMP   | 생성일                    |

## study_user (참가자)

| 속성명  | 자료형  | 제약 조건                   | 설명      |
| ------- | ------- | --------------------------- | --------- |
| id      | INTEGER | PRIMARY KEY, AUTO_INCREMENT | ID        |
| user_id | INTEGER | FOREIGN KEY                 | 사용자 ID |
| room_id | INTEGER | FOREIGN KEY                 | 공부방 ID |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (room_id) REFERENCES study_room(id)
ON DELETE CASCADE
ON UPDATE CASCADE

`UNIQUE (user_id, room_id)`

## study_log (공부방 실시간 동기화 로그)

| 속성명  | 자료형                 | 제약 조건                   | 설명      |
| ------- | ---------------------- | --------------------------- | --------- |
| id      | INTEGER                | PRIMARY KEY, AUTO_INCREMENT | 로그 id   |
| user_id | INTEGER                | FOREIGN KEY                 | 사용자 ID |
| room_id | INTEGER                | FOREIGN KEY                 | 공부방 ID |
| start   | DATETIME               | DEFAULT CURRENT_TIMESTAMP   | 시작 시간 |
| end     | DATETIME               |                             | 종료 시간 |
| status  | ENUM('공부중', '종료') | DEFAULT '공부중'            | 상태      |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (room_id) REFERENCES study_room(id)
ON DELETE CASCADE
ON UPDATE CASCADE

`INDEX (room_id, status)`

## chat (채팅)

| 속성명  | 자료형   | 제약 조건                   | 설명                               |
| ------- | -------- | --------------------------- | ---------------------------------- |
| id      | INTEGER  | PRIMARY KEY, AUTO_INCREMENT | 채팅 ID                            |
| user_id | INTEGER  | FOREIGN KEY                 | 사용자 ID (NULL이면 삭제된 사용자) |
| room_id | INTEGER  | FOREIGN KEY                 | 공부방 ID                          |
| message | TEXT     | NOT NULL                    | 내용                               |
| time    | DATETIME | DEFAULT CURRENT_TIMESTAMP   | 전송된 시간                        |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE SET NULL
ON UPDATE CASCADE

FOREIGN KEY (room_id) REFERENCES study_room(id)
ON DELETE CASCADE
ON UPDATE CASCADE

## chat_read_cursor (채팅 읽음 커서)

| 속성명            | 자료형   | 제약 조건                                             | 설명                    |
| ----------------- | -------- | ----------------------------------------------------- | ----------------------- |
| id                | INTEGER  | PRIMARY KEY, AUTO_INCREMENT                           | ID                      |
| user_id           | INTEGER  | FOREIGN KEY                                           | 사용자 ID               |
| room_id           | INTEGER  | FOREIGN KEY                                           | 공부방 ID               |
| last_read_chat_id | INTEGER  | FOREIGN KEY (nullable)                                | 마지막으로 읽은 채팅 ID |
| updated_at        | DATETIME | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 갱신 시각               |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (room_id) REFERENCES study_room(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (last_read_chat_id) REFERENCES chat(id)
ON DELETE SET NULL
ON UPDATE CASCADE

`UNIQUE (user_id, room_id)`

- 메시지마다 참여자 수만큼 row가 생기던 기존 방식 대신, 유저×방 조합당 커서 1개만 유지.
- 안읽음 개수 = `chat`에서 `room_id` 일치 & `id > last_read_chat_id`인 row 수.

---

# To Do

## todo (To Do 리스트)

| 속성명   | 자료형       | 제약 조건                   | 설명        |
| -------- | ------------ | --------------------------- | ----------- |
| id       | INTEGER      | PRIMARY KEY, AUTO_INCREMENT | ID          |
| user_id  | INTEGER      | FOREIGN KEY                 | 사용자 ID   |
| title    | VARCHAR(255) | NOT NULL                    | 제목        |
| descript | TEXT         |                             | 내용        |
| is_do    | BOOLEAN      | DEFAULT FALSE               | 실행했는가? |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

## todo_subject (To Do 과목 연결)

| 속성명     | 자료형  | 제약 조건                   | 설명     |
| ---------- | ------- | --------------------------- | -------- |
| id         | INTEGER | PRIMARY KEY, AUTO_INCREMENT | ID       |
| todo_id    | INTEGER | FOREIGN KEY                 | To Do ID |
| subject_id | INTEGER | FOREIGN KEY                 | 과목 ID  |

FOREIGN KEY (todo_id) REFERENCES todo(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (subject_id) REFERENCES subject(id)
ON DELETE RESTRICT
ON UPDATE RESTRICT

`UNIQUE (todo_id, subject_id)`

## schedule (일정)

| 속성명   | 자료형       | 제약 조건                   | 설명      |
| -------- | ------------ | --------------------------- | --------- |
| id       | INTEGER      | PRIMARY KEY, AUTO_INCREMENT | ID        |
| user_id  | INTEGER      | FOREIGN KEY                 | 사용자 ID |
| title    | VARCHAR(255) | NOT NULL                    | 제목      |
| descript | TEXT         |                             | 내용      |
| date     | DATETIME     | NOT NULL                    | 날짜      |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

## schedule_subject (일정 과목 연결)

| 속성명      | 자료형  | 제약 조건                   | 설명    |
| ----------- | ------- | --------------------------- | ------- |
| id          | INTEGER | PRIMARY KEY, AUTO_INCREMENT | ID      |
| schedule_id | INTEGER | FOREIGN KEY                 | 일정 ID |
| subject_id  | INTEGER | FOREIGN KEY                 | 과목 ID |

FOREIGN KEY (schedule_id) REFERENCES schedule(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (subject_id) REFERENCES subject(id)
ON DELETE RESTRICT
ON UPDATE RESTRICT

`UNIQUE (schedule_id, subject_id)`

---

# 과목

## subject (과목)

| 속성명 | 자료형       | 제약 조건                   | 설명    |
| ------ | ------------ | --------------------------- | ------- |
| id     | INTEGER      | PRIMARY KEY, AUTO_INCREMENT | 과목 ID |
| name   | VARCHAR(255) | NOT NULL                    | 과목    |

## subject_like (관심있는 과목, 서버 로직상 최대 5개)

| 속성명     | 자료형  | 제약 조건                   | 설명      |
| ---------- | ------- | --------------------------- | --------- |
| id         | INTEGER | PRIMARY KEY, AUTO_INCREMENT | ID        |
| user_id    | INTEGER | FOREIGN KEY                 | 사용자 ID |
| subject_id | INTEGER | FOREIGN KEY                 | 과목 ID   |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (subject_id) REFERENCES subject(id)
ON DELETE RESTRICT
ON UPDATE RESTRICT

`UNIQUE (user_id, subject_id)`

## subject_count (사용자별 과목 공부 횟수)

| 속성명     | 자료형  | 제약 조건                   | 설명      |
| ---------- | ------- | --------------------------- | --------- |
| id         | INTEGER | PRIMARY KEY, AUTO_INCREMENT | ID        |
| user_id    | INTEGER | FOREIGN KEY                 | 사용자 ID |
| subject_id | INTEGER | FOREIGN KEY                 | 과목 ID   |
| count      | INTEGER | DEFAULT 1                   | 횟수      |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (subject_id) REFERENCES subject(id)
ON DELETE RESTRICT
ON UPDATE RESTRICT

`UNIQUE (user_id, subject_id)`

## subject_room (공부방의 과목, 서버 로직상 최대 3개)

| 속성명     | 자료형  | 제약 조건                   | 설명      |
| ---------- | ------- | --------------------------- | --------- |
| id         | INTEGER | PRIMARY KEY, AUTO_INCREMENT | ID        |
| room_id    | INTEGER | FOREIGN KEY                 | 공부방 ID |
| subject_id | INTEGER | FOREIGN KEY                 | 과목 ID   |

FOREIGN KEY (room_id) REFERENCES study_room(id)
ON DELETE RESTRICT
ON UPDATE RESTRICT

FOREIGN KEY (subject_id) REFERENCES subject(id)
ON DELETE RESTRICT
ON UPDATE RESTRICT

`UNIQUE (room_id, subject_id)`

---

# AI 도우미

## ai_room (AI 채팅방)

| 속성명  | 자료형       | 제약 조건                   | 설명      |
| ------- | ------------ | --------------------------- | --------- |
| id      | INTEGER      | PRIMARY KEY, AUTO_INCREMENT | ID        |
| title   | VARCHAR(255) | NOT NULL                    | 제목      |
| user_id | INTEGER      | FOREIGN KEY                 | 사용자 ID |
| summary | TEXT         |                             | 요약      |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

## ai_chat (AI 채팅)

| 속성명     | 자료형   | 제약 조건                   | 설명                                      |
| ---------- | -------- | --------------------------- | ----------------------------------------- |
| id         | INTEGER  | PRIMARY KEY, AUTO_INCREMENT | ID                                        |
| comment    | TEXT     | NOT NULL                    | 내용                                      |
| ai_room_id | INTEGER  | FOREIGN KEY                 | AI 채팅방 ID                              |
| date       | DATETIME | DEFAULT CURRENT_TIMESTAMP   | 날짜                                      |
| speaker    | INTEGER  | NULL 허용                   | 사용자 답변이면 user ID, AI 답변이면 NULL |

FOREIGN KEY (ai_room_id) REFERENCES ai_room(id)
ON DELETE CASCADE
ON UPDATE CASCADE

---

# 알림

## notification (알림)

| 속성명   | 자료형                                   | 제약 조건                   | 설명          |
| -------- | ---------------------------------------- | --------------------------- | ------------- |
| id       | INTEGER                                  | PRIMARY KEY, AUTO_INCREMENT | ID            |
| title    | VARCHAR(255)                             | NOT NULL                    | 제목          |
| descript | TEXT                                     | NOT NULL                    | 설명          |
| type     | ENUM('notice', 'schedule', 'study_room') | NOT NULL                    | 알림 카테고리 |

## notification_user (알림 읽음/읽지 않음)

| 속성명          | 자료형  | 제약 조건                   | 설명      |
| --------------- | ------- | --------------------------- | --------- |
| id              | INTEGER | PRIMARY KEY, AUTO_INCREMENT | ID        |
| user_id         | INTEGER | FOREIGN KEY                 | 사용자 ID |
| notification_id | INTEGER | FOREIGN KEY                 | 알림 ID   |
| is_read         | BOOLEAN | DEFAULT FALSE               | 읽었는가? |

FOREIGN KEY (user_id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

FOREIGN KEY (notification_id) REFERENCES notification(id)
ON DELETE CASCADE
ON UPDATE CASCADE

## notification_setting (알림 설정)

| 속성명     | 자료형  | 제약 조건                | 설명               |
| ---------- | ------- | ------------------------ | ------------------ |
| id         | INTEGER | PRIMARY KEY, FOREIGN KEY | 사용자 ID          |
| notice     | BOOLEAN | DEFAULT TRUE             | 공지사항 알림      |
| schedule   | BOOLEAN | DEFAULT TRUE             | 일정 및 To Do 알림 |
| study_room | BOOLEAN | DEFAULT TRUE             | 공부방 관련 알림   |

FOREIGN KEY (id) REFERENCES user(id)
ON DELETE CASCADE
ON UPDATE CASCADE

---

## 참고 사항

- **time_log 스케줄러**: cron(일/주/월 경계에 일괄 flush+reset) + lazy check(요청 시점에 `last_*_reset_at`이 오늘 이전이면 즉시 flush+reset) 하이브리드로 결정. `time` 테이블의 `last_day_reset_at`/`last_week_reset_at`
