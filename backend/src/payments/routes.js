const express = require("express");
const { receiveWebhook } = require("./service");

const webhookRouter = express.Router();

webhookRouter.post("/:provider", async (req, res) => {
  const result = await receiveWebhook(req.params.provider, req.body, req.headers);
  res.status(result.status).json(result.body);
});

module.exports = {
  webhookRouter,
};
