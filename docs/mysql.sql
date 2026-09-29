
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS hanul
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE hanul;

-- 시간 기준: 모든 DATETIME은 한국 시간(KST)으로 저장한다.
--   MySQL 서버 --default-time-zone='+09:00', Node 드라이버 timezone '+09:00'으로 맞춘다.
--   (일·주·월 집계를 KST 자정·월요일·1일 기준으로 나누기 위함)

-- ---------------------------------------------------------------------
-- 사용자
-- ---------------------------------------------------------------------

CREATE TABLE auth (
  id            INT          PRIMARY KEY AUTO_INCREMENT,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password      VARCHAR(255) NOT NULL,                -- bcrypt 해시
  role          ENUM('user','admin') NOT NULL DEFAULT 'user', -- 공지 발송 권한
  terms_version VARCHAR(16)  NOT NULL,                -- 동의한 개인정보 처리방침 버전
  agreed_at     DATETIME     NOT NULL,                -- 개인정보 수집 동의 시각
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- 비밀번호 재설정 (메일로 보낸 토큰은 해시만 저장)
CREATE TABLE password_reset (
  id         INT          PRIMARY KEY AUTO_INCREMENT,
  auth_id    INT          NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME     NOT NULL,
  used_at    DATETIME     NULL,                       -- 사용 완료 시각 (재사용 방지)
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (auth_id) REFERENCES auth(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE user (
  id                INT         PRIMARY KEY,
  identifier        VARCHAR(16) NOT NULL UNIQUE,
  name              VARCHAR(16) NOT NULL,
  birth             DATE        NOT NULL,
  gender            BOOLEAN     NULL,                 -- 선택 항목. 0=남, 1=여, NULL=미입력
  img               VARCHAR(255),                     -- Cloudinary URL
  comment           VARCHAR(255),
  start_year        YEAR        NOT NULL,             -- 입학연도. 표시·분류용 (반 소속 구분은 class.year)
  -- 공개 범위: 전체 / 반 / 공부방 / 비공개
  status_visibility ENUM('all','class','room','private') NOT NULL DEFAULT 'all', -- 공부 상태
  time_visibility   ENUM('all','class','room','private') NOT NULL DEFAULT 'all', -- 공부 시간
  hide_ranking      BOOLEAN     NOT NULL DEFAULT FALSE, -- 내 랭킹 노출 끄기
  hide_ranking_view BOOLEAN     NOT NULL DEFAULT FALSE, -- 랭킹 화면 열람 끄기
  FOREIGN KEY (id) REFERENCES auth(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- 학년/반 (해당 학년도 반에 처음 가입하는 학생이 있을 때 서버가 생성)
CREATE TABLE class (
  id    INT  PRIMARY KEY AUTO_INCREMENT,
  year  YEAR NOT NULL,
  grade INT  NOT NULL,
  class INT  NOT NULL,
  UNIQUE (year, grade, class),
  UNIQUE (id, year)                                  -- class_user 복합 FK 대상
);

-- 반 소속 (진급 시 새 row 추가, 예전 row 유지)
CREATE TABLE class_user (
  id       INT  PRIMARY KEY AUTO_INCREMENT,
  class_id INT  NOT NULL,
  user_id  INT  NOT NULL,
  year     YEAR NOT NULL,                            -- class.year와 복합 FK로 일치 강제
  number   INT  NOT NULL,
  UNIQUE (class_id, number),                         -- 같은 반 번호 중복 금지
  UNIQUE (user_id, year),                            -- 한 학년도에 한 반만
  FOREIGN KEY (class_id, year) REFERENCES class(id, year)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 과목
-- ---------------------------------------------------------------------

CREATE TABLE subject (
  id   INT          PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE subject_like (                           -- 서버 로직상 최대 5개
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,
  subject_id INT NOT NULL,
  UNIQUE (user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subject(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ---------------------------------------------------------------------
-- 공부방 (반 메인도 type='class'인 공부방)
-- ---------------------------------------------------------------------

CREATE TABLE study_room (
  id             INT          PRIMARY KEY AUTO_INCREMENT,
  type           ENUM('class','custom') NOT NULL DEFAULT 'custom',
  class_id       INT          NULL UNIQUE,           -- 반 방: 어느 반인지 (반당 1개)
  title          VARCHAR(255) NOT NULL,
  comment        VARCHAR(255),
  room_code      VARCHAR(6)   NULL UNIQUE,           -- 일반 방만. 영문+숫자 6자리
  owner_id       INT          NULL,                  -- 일반 방만. 방장
  max_members    INT          NULL,                  -- 일반 방만. 최대 인원
  created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  last_active_at DATETIME     DEFAULT CURRENT_TIMESTAMP, -- 비활성 방 자동 삭제 기준
  CHECK (
    (type = 'class'  AND class_id IS NOT NULL AND room_code IS NULL
                     AND owner_id IS NULL     AND max_members IS NULL)
    OR
    (type = 'custom' AND class_id IS NULL     AND room_code IS NOT NULL
                     AND owner_id IS NOT NULL AND max_members IS NOT NULL)
  ),
  -- CHECK에 쓰인 컬럼의 FK는 CASCADE/SET NULL을 쓸 수 없어 RESTRICT로 둔다.
  -- 방장이 남아 있는 방이 있으면 회원 탈퇴가 거부된다 → 위임 또는 폭파 후 탈퇴.
  FOREIGN KEY (owner_id) REFERENCES user(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (class_id) REFERENCES class(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- 참가자 (반 방은 회원가입·진급 시 서버가 INSERT)
CREATE TABLE study_user (
  id        INT      PRIMARY KEY AUTO_INCREMENT,
  user_id   INT      NOT NULL,
  room_id   INT      NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,      -- 방장 위임 후보 순서
  UNIQUE (user_id, room_id),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (room_id) REFERENCES study_room(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- 공부방 키워드
CREATE TABLE subject_room (                           -- 서버 로직상 최대 3개
  id         INT PRIMARY KEY AUTO_INCREMENT,
  room_id    INT NOT NULL,
  subject_id INT NOT NULL,
  UNIQUE (room_id, subject_id),
  FOREIGN KEY (room_id) REFERENCES study_room(id)
    ON DELETE CASCADE ON UPDATE CASCADE,              -- 방 폭파 시 함께 삭제
  FOREIGN KEY (subject_id) REFERENCES subject(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- 초대 (수락 시 서버가 study_user INSERT)
CREATE TABLE room_invite (
  id          INT      PRIMARY KEY AUTO_INCREMENT,
  room_id     INT      NOT NULL,
  inviter_id  INT      NOT NULL,                     -- 초대한 방장
  invitee_id  INT      NOT NULL,                     -- 초대받은 사용자
  status      ENUM('대기','수락','거절') NOT NULL DEFAULT '대기',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  answered_at DATETIME NULL,
  -- 대기 중이면 1, 응답했으면 NULL → 같은 방에 대기 중인 초대는 1개만
  is_pending  TINYINT AS (IF(status = '대기', 1, NULL)) STORED,
  UNIQUE (room_id, invitee_id, is_pending),
  INDEX (invitee_id, status),
  FOREIGN KEY (room_id) REFERENCES study_room(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (inviter_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 공부 기록
--   study_session : 사람 단위 공부 구간 (동시에 1개) → 총 공부 시간, 과목별 비율, '공부중' 표시
--   study_log     : 세션 안에서 방별로 있었던 구간     → 방별 공부 시간
--   study_daily   : 날짜별 합계 (세션 종료 시 자정 단위로 나눠 더함) → 일/주/월/누적, 랭킹
--   가장 많이 공부한 과목은 study_session을 subject_id로 묶어 (end - start) 합계로 구한다.
-- ---------------------------------------------------------------------

CREATE TABLE study_session (
  id                INT      PRIMARY KEY AUTO_INCREMENT,
  user_id           INT      NOT NULL,
  subject_id        INT      NOT NULL,                -- 공부 시작 시 선택한 과목
  start             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end               DATETIME NULL,
  status            ENUM('공부중','종료','자동종료') NOT NULL DEFAULT '공부중',
  last_heartbeat_at DATETIME NULL,                    -- 응답 없는 세션 자동 종료용
  confirmed_at      DATETIME NULL,                    -- 마지막으로 '응답'을 누른 시각 (3시간 확인 기준)
  check_deadline    DATETIME NULL,                    -- 응답 확인 중이면 마감 시각, 아니면 NULL
  -- 공부중이면 1, 종료면 NULL. UNIQUE는 NULL 중복을 허용하므로
  -- 종료된 세션은 얼마든지 쌓이고, 공부중 세션만 사람당 1개로 제한된다.
  is_active         TINYINT AS (IF(status = '공부중', 1, NULL)) STORED,
  UNIQUE (user_id, is_active),
  INDEX (status),
  INDEX (user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subject(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE study_log (
  id                INT      PRIMARY KEY AUTO_INCREMENT,
  session_id        INT      NOT NULL,
  room_id           INT      NOT NULL,
  start             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end               DATETIME NULL,
  status            ENUM('공부중','종료','자동종료') NOT NULL DEFAULT '공부중',
  last_heartbeat_at DATETIME NULL,                    -- 방 연결이 끊긴 기록 자동 종료용
  is_active         TINYINT AS (IF(status = '공부중', 1, NULL)) STORED,
  UNIQUE (session_id, room_id, is_active),            -- 같은 방에 동시에 두 번 X
  INDEX (room_id, status),
  FOREIGN KEY (session_id) REFERENCES study_session(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (room_id) REFERENCES study_room(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE study_daily (
  user_id INT  NOT NULL,
  date    DATE NOT NULL,
  seconds INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  INDEX (date),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 채팅 (반 방·일반 방 공통)
-- ---------------------------------------------------------------------

CREATE TABLE chat (
  id      INT      PRIMARY KEY AUTO_INCREMENT,
  user_id INT      NULL,                              -- NULL = 탈퇴한 사용자
  room_id INT      NOT NULL,
  message TEXT     NOT NULL,
  time    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (room_id, id),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (room_id) REFERENCES study_room(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE chat_read_cursor (
  id                INT      PRIMARY KEY AUTO_INCREMENT,
  user_id           INT      NOT NULL,
  room_id           INT      NOT NULL,
  last_read_chat_id INT      NULL,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE (user_id, room_id),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (room_id) REFERENCES study_room(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (last_read_chat_id) REFERENCES chat(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- 채팅 신고
CREATE TABLE chat_report (
  id          INT          PRIMARY KEY AUTO_INCREMENT,
  chat_id     INT          NOT NULL,
  reporter_id INT          NOT NULL,
  reason      VARCHAR(255) NOT NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (chat_id, reporter_id),                      -- 같은 채팅 중복 신고 X
  FOREIGN KEY (chat_id) REFERENCES chat(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- To Do / 일정
-- ---------------------------------------------------------------------

CREATE TABLE todo (
  id          INT          PRIMARY KEY AUTO_INCREMENT,
  user_id     INT          NOT NULL,
  title       VARCHAR(255) NOT NULL,
  descript    TEXT,
  due_date    DATETIME     NULL,                      -- 마감일 (없으면 NULL)
  is_do       BOOLEAN      DEFAULT FALSE,
  notified_at DATETIME     NULL,                      -- 마감 알림 발송 시각 (중복 발송 방지)
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, due_date),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE todo_subject (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  todo_id    INT NOT NULL,
  subject_id INT NOT NULL,
  UNIQUE (todo_id, subject_id),
  FOREIGN KEY (todo_id) REFERENCES todo(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subject(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE schedule (
  id          INT          PRIMARY KEY AUTO_INCREMENT,
  user_id     INT          NOT NULL,
  title       VARCHAR(255) NOT NULL,
  descript    TEXT,
  date        DATETIME     NOT NULL,
  notified_at DATETIME     NULL,                      -- 일정 알림 발송 시각 (중복 발송 방지)
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, date),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE schedule_subject (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  schedule_id INT NOT NULL,
  subject_id  INT NOT NULL,
  UNIQUE (schedule_id, subject_id),
  FOREIGN KEY (schedule_id) REFERENCES schedule(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subject(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ---------------------------------------------------------------------
-- AI 도우미
-- ---------------------------------------------------------------------

CREATE TABLE ai_room (
  id         INT          PRIMARY KEY AUTO_INCREMENT,
  title      VARCHAR(255) NOT NULL,
  user_id    INT          NOT NULL,
  summary    TEXT,                                    -- 긴 대화 앞부분 요약 (AI-007)
  summary_chat_id INT NULL,                           -- 요약에 포함된 마지막 ai_chat.id
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- 목록 정렬용
  INDEX (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE ai_chat (
  id         INT      PRIMARY KEY AUTO_INCREMENT,
  comment    TEXT     NOT NULL,
  ai_room_id INT      NOT NULL,
  date       DATETIME DEFAULT CURRENT_TIMESTAMP,
  role       ENUM('user','ai') NOT NULL,              -- 사용자는 ai_room.user_id
  tokens     INT      NULL,                           -- AI 응답에 쓴 토큰 수
  FOREIGN KEY (ai_room_id) REFERENCES ai_room(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- 일일 사용량 (요청마다 count +1, tokens 누적) → 일일 제한, 월 예산 관리
CREATE TABLE ai_usage (
  user_id INT  NOT NULL,
  date    DATE NOT NULL,
  count   INT  NOT NULL DEFAULT 0,
  tokens  INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  INDEX (date),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 알림
-- ---------------------------------------------------------------------

CREATE TABLE notification (
  id          INT          PRIMARY KEY AUTO_INCREMENT,
  title       VARCHAR(255) NOT NULL,
  descript    TEXT         NOT NULL,
  type        ENUM('notice','schedule','study_room') NOT NULL,
  -- 클릭 시 이동할 대상 (공지처럼 대상이 없으면 NULL)
  target_type ENUM('schedule','todo','study_room','room_invite') NULL,
  target_id   INT          NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification_user (
  id              INT     PRIMARY KEY AUTO_INCREMENT,
  user_id         INT     NOT NULL,
  notification_id INT     NOT NULL,
  is_read         BOOLEAN DEFAULT FALSE,
  UNIQUE (user_id, notification_id),
  INDEX (user_id, is_read),                           -- 안 읽은 알림 수
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (notification_id) REFERENCES notification(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE notification_setting (
  id         INT     PRIMARY KEY,
  notice     BOOLEAN DEFAULT TRUE,
  schedule   BOOLEAN DEFAULT TRUE,
  study_room BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);
