const cors = require("cors");

const express = require("express");

const app = express();
app.use(cors());


app.get("/", (req, res) => {
  res.json({ message: "Backend is alive" });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
