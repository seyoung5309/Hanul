
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS hanul
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE hanul;

-- ---------------------------------------------------------------------
-- 사용자
-- ---------------------------------------------------------------------

CREATE TABLE auth (
  id         INT          PRIMARY KEY AUTO_INCREMENT,
  email      VARCHAR(255) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,                  -- bcrypt 해시
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user (
  id         INT          PRIMARY KEY,
  identifier VARCHAR(16)  NOT NULL UNIQUE,
  name       VARCHAR(16)  NOT NULL,
  gender     BOOLEAN      NOT NULL,                  -- 0=남, 1=여
  img        VARCHAR(255),                           -- Cloudinary URL
  comment    VARCHAR(255),
  start_year YEAR         NOT NULL,
  FOREIGN KEY (id) REFERENCES auth(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- 학년/반 (학년도별로 미리 생성)
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

-- ---------------------------------------------------------------------
-- 공부 기록
--   study_session : 사람 단위 공부 구간 (동시에 1개) → 총 공부 시간, '공부중' 표시
--   study_log     : 세션 안에서 방별로 있었던 구간     → 방별 공부 시간
--   study_daily   : 날짜별 합계 (세션 종료 시 자정 단위로 나눠 더함) → 일/주/월/누적, 랭킹
-- ---------------------------------------------------------------------

CREATE TABLE study_session (
  id        INT      PRIMARY KEY AUTO_INCREMENT,
  user_id   INT      NOT NULL,
  start     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end       DATETIME NULL,
  status    ENUM('공부중','종료') NOT NULL DEFAULT '공부중',
  -- 공부중이면 1, 종료면 NULL. UNIQUE는 NULL 중복을 허용하므로
  -- 종료된 세션은 얼마든지 쌓이고, 공부중 세션만 사람당 1개로 제한된다.
  is_active TINYINT AS (IF(status = '공부중', 1, NULL)) STORED,
  UNIQUE (user_id, is_active),
  INDEX (status),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE study_log (
  id                INT      PRIMARY KEY AUTO_INCREMENT,
  session_id        INT      NOT NULL,
  room_id           INT      NOT NULL,
  start             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end               DATETIME NULL,
  status            ENUM('공부중','종료') NOT NULL DEFAULT '공부중',
  last_heartbeat_at DATETIME NULL,                    -- 응답 없는 기록 자동 종료용
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

-- ---------------------------------------------------------------------
-- 과목
-- ---------------------------------------------------------------------

CREATE TABLE subject (
  id   INT          PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL
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

CREATE TABLE subject_count (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,
  subject_id INT NOT NULL,
  count      INT NOT NULL DEFAULT 1,
  UNIQUE (user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subject(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE subject_room (                           -- 서버 로직상 최대 3개
  id         INT PRIMARY KEY AUTO_INCREMENT,
  room_id    INT NOT NULL,
  subject_id INT NOT NULL,
  UNIQUE (room_id, subject_id),
  FOREIGN KEY (room_id) REFERENCES study_room(id)
    ON DELETE CASCADE ON UPDATE CASCADE,              -- RESTRICT → CASCADE (방 폭파)
  FOREIGN KEY (subject_id) REFERENCES subject(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- ---------------------------------------------------------------------
-- To Do / 일정 (변경 없음)
-- ---------------------------------------------------------------------

CREATE TABLE todo (
  id       INT          PRIMARY KEY AUTO_INCREMENT,
  user_id  INT          NOT NULL,
  title    VARCHAR(255) NOT NULL,
  descript TEXT,
  is_do    BOOLEAN      DEFAULT FALSE,
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
  id       INT          PRIMARY KEY AUTO_INCREMENT,
  user_id  INT          NOT NULL,
  title    VARCHAR(255) NOT NULL,
  descript TEXT,
  date     DATETIME     NOT NULL,
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
-- AI 도우미 (변경 없음)
-- ---------------------------------------------------------------------

CREATE TABLE ai_room (
  id      INT          PRIMARY KEY AUTO_INCREMENT,
  title   VARCHAR(255) NOT NULL,
  user_id INT          NOT NULL,
  summary TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE ai_chat (
  id         INT      PRIMARY KEY AUTO_INCREMENT,
  comment    TEXT     NOT NULL,
  ai_room_id INT      NOT NULL,
  date       DATETIME DEFAULT CURRENT_TIMESTAMP,
  speaker    INT      NULL,                           -- 사용자면 user ID, AI면 NULL
  FOREIGN KEY (ai_room_id) REFERENCES ai_room(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 알림 (변경 없음)
-- ---------------------------------------------------------------------

CREATE TABLE notification (
  id       INT          PRIMARY KEY AUTO_INCREMENT,
  title    VARCHAR(255) NOT NULL,
  descript TEXT         NOT NULL,
  type     ENUM('notice','schedule','study_room') NOT NULL
);

CREATE TABLE notification_user (
  id              INT     PRIMARY KEY AUTO_INCREMENT,
  user_id         INT     NOT NULL,
  notification_id INT     NOT NULL,
  is_read         BOOLEAN DEFAULT FALSE,
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