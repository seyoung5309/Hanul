const nodemailer = require("nodemailer");
const { mail } = require("../config/env");

const transporter = mail.host
  ? nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.port === 465,
      auth: { user: mail.user, pass: mail.pass },
    })
  : null;

async function sendMail({ to, subject, text }) {
  // SMTP 설정이 없으면 개발용으로 콘솔에 출력
  if (!transporter) {
    console.log(`[메일 미설정] 받는 사람: ${to}\n제목: ${subject}\n${text}`);
    return;
  }
  await transporter.sendMail({ from: mail.from, to, subject, text });
}

module.exports = { sendMail };
