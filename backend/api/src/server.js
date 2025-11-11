// backend/api/src/server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const reportRouter = require("./routes/report");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

app.use("/report", reportRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Phish-detect API listening on http://localhost:${PORT}`);
});
