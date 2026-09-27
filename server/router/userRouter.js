const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// ----- 로그인 없이 사용 -----
// UD-001 POST   /signup                 회원가입 (학년·반·번호 포함 → UD-003 반 메인 자동 참여)
// UD-002 GET    /check?email=&identifier=  중복 확인
// UD-004 POST   /login                  로그인 → token 쿠키 발급
// UD-006 POST   /password-reset         재설정 메일 발송
// UD-006 PUT    /password-reset         토큰으로 새 비밀번호 설정

// ----- 여기부터 로그인 필요 -----
router.use(requireAuth);

// UD-005 POST   /logout                 token 쿠키 삭제
// UD-007 GET    /me                     내 프로필
// UD-007 PATCH  /me                     프로필 사진·한 마디·관심 과목 수정
// UD-008 PATCH  /me/visibility          공개 범위
// ST-008 PATCH  /me/ranking             랭킹 숨기기
// UD-010 POST   /me/class               새 학년도 반 갱신
// UD-009 DELETE /me                     회원 탈퇴
//        GET    /search?identifier=     아이디 검색 (SR-008 초대용)

module.exports = router;
