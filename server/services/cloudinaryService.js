const crypto = require("crypto");
const { cloudinary } = require("../config/env");
const HttpError = require("../utils/httpError");

// 프로필 사진은 브라우저가 Cloudinary로 바로 올린다. (서버는 서명만 만들고, 파일은 거치지 않는다)
//   1) POST /api/users/me/img/upload  → 업로드에 쓸 폼 값 (서명 포함)
//   2) 브라우저가 Cloudinary에 업로드  → secure_url
//   3) PUT  /api/users/me/img { url }  → 내 사진 주소인지 확인하고 저장
// 서명에 public_id를 넣어 두므로 자기 자리(user_{id})에만 올릴 수 있다.

const FOLDER = "hanul/avatars";
const FORMATS = ["jpg", "jpeg", "png", "webp"];
const TRANSFORMATION = "c_fill,w_400,h_400"; // 올릴 때 가운데를 400x400으로 잘라 저장

function requireConfig() {
  if (!cloudinary.cloudName || !cloudinary.apiKey || !cloudinary.apiSecret) {
    throw new HttpError(503, "사진 업로드가 설정되지 않았습니다. (CLOUDINARY_*)");
  }
}

const publicIdOf = (userId) => `${FOLDER}/user_${userId}`;
const roomPublicIdOf = (roomId) => `hanul/rooms/room_${roomId}`; // 스터디룸 썸네일 (400x400으로 잘라 저장)

// Cloudinary 서명: 파라미터를 이름순으로 "k=v&k=v" 로 잇고 API secret을 붙여 SHA-1
function sign(params) {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + cloudinary.apiSecret).digest("hex");
}

// 업로드 폼에 그대로 넣을 값 (file만 브라우저가 추가한다). 서명은 1시간 동안 유효하다.
function createUpload(publicId) {
  requireConfig();
  const params = {
    allowed_formats: FORMATS.join(","),
    invalidate: true, // 같은 자리에 덮어쓸 때 CDN 캐시도 비운다
    overwrite: true,
    public_id: publicId,
    timestamp: Math.floor(Date.now() / 1000),
    transformation: TRANSFORMATION,
  };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,
    fields: { ...params, api_key: cloudinary.apiKey, signature: sign(params) },
  };
}

// 업로드 결과의 secure_url이 이 자리(publicId)의 사진인지 확인한다.
function isUploadedUrl(publicId, url) {
  if (!cloudinary.cloudName || typeof url !== "string") return false;
  const prefix = `https://res.cloudinary.com/${cloudinary.cloudName}/image/upload/`;
  const pattern = new RegExp(`^v\\d+/${publicId}\\.(${FORMATS.join("|")})$`);
  return url.startsWith(prefix) && pattern.test(url.slice(prefix.length));
}

// 프로필 사진
const createAvatarUpload = (userId) => createUpload(publicIdOf(userId));
const isAvatarUrl = (userId, url) => isUploadedUrl(publicIdOf(userId), url);

// 스터디룸 썸네일 (방장만, 컨트롤러에서 확인)
const createRoomUpload = (roomId) => createUpload(roomPublicIdOf(roomId));
const isRoomImgUrl = (roomId, url) => isUploadedUrl(roomPublicIdOf(roomId), url);

module.exports = { createAvatarUpload, isAvatarUrl, createRoomUpload, isRoomImgUrl, sign };
