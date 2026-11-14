const crypto = require("crypto");
const { cloudinary } = require("../config/env");
const HttpError = require("../utils/httpError");

//   1. POST /api/users/me/img/upload -> 업로드에 쓸 폼 값 (서명 포함)
//   2. 브라우저가 Cloudinary에 업로드 -> secure_url
//   3. PUT  /api/users/me/img { url } -> 내 사진 주소인지 확인하고 저장

const FOLDER = "hanul/avatars";
const FORMATS = ["jpg", "jpeg", "png", "webp"];
const SIZE = "c_fill,w_400,h_400"; // 올릴 때 400x400으로 잘라 저장

function requireConfig() {
  if (!cloudinary.cloudName || !cloudinary.apiKey || !cloudinary.apiSecret) {
    throw new HttpError(
      503,
      "사진 업로드가 설정되지 않았습니다. (CLOUDINARY_*)",
    );
  }
}

let publicIdOf = (userId) => {
  return `${FOLDER}/user_${userId}`;
};

let roomPublicIdOf = (roomId) => {
  return `hanul/rooms/room_${roomId}`; // 스터디룸 썸네일
};

// Cloudinary 서명
function sign(params) {
  let toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(toSign + cloudinary.apiSecret)
    .digest("hex");
}

// 업로드에 넣을 값(사인은 1시간 유효)
function createUpload(publicId) {
  requireConfig();

  let params = {
    allowed_formats: FORMATS.join(","),
    invalidate: true, // 같은 자리에 덮어쓸 때 CDN 캐시도 비운다
    overwrite: true,
    public_id: publicId,
    timestamp: Math.floor(Date.now() / 1000),
    transformation: SIZE,
  };

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,
    fields: { ...params, api_key: cloudinary.apiKey, signature: sign(params) },
  };
}

//  secure_url이 맞는 사진인지 확인
function isUploadedUrl(publicId, url) {
  if (!cloudinary.cloudName || typeof url !== "string") {
    return false;
  }

  let prefix = `https://res.cloudinary.com/${cloudinary.cloudName}/image/upload/`;
  let pattern = new RegExp(`^v\\d+/${publicId}\\.(${FORMATS.join("|")})$`);

  return url.startsWith(prefix) && pattern.test(url.slice(prefix.length));
}

// 프로필 사진
let createAvatarUpload = (userId) => {
  return createUpload(publicIdOf(userId));
};

let isAvatarUrl = (userId, url) => {
  return isUploadedUrl(publicIdOf(userId), url);
};

// 스터디룸 썸네일 (방장만, 컨트롤러에서 확인)
let createRoomUpload = (roomId) => {
  return createUpload(roomPublicIdOf(roomId));
};

let isRoomImgUrl = (roomId, url) => {
  return isUploadedUrl(roomPublicIdOf(roomId), url);
};

module.exports = {
  createAvatarUpload,
  isAvatarUrl,
  createRoomUpload,
  isRoomImgUrl,
  sign,
};
