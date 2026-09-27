const pool = require("../config/db");

async function findAll() {
  const [rows] = await pool.query("SELECT id, name FROM subject ORDER BY id");
  return rows;
}

module.exports = { findAll };
