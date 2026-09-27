const subjectModel = require("../models/subjectModel");

async function getSubjects(req, res) {
  res.json(await subjectModel.findAll());
}

module.exports = { getSubjects };
