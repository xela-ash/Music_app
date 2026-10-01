const express = require("express");
const service = require("./service");

const router = express.Router();

router.get("/users", async (req, res) => {
  const result = await service.listUsers();
  res.status(result.status).json(result.body);
});

module.exports = router;
