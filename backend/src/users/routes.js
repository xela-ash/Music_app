const express = require("express");
const service = require("./service");

const router = express.Router();

router.post("/users", async (req, res) => {
  const result = await service.createUser(req.body);
  res.status(result.status).json(result.body);
});

router.get("/users", async (req, res) => {
  const result = await service.listUsers();
  res.status(result.status).json(result.body);
});

module.exports = router;
