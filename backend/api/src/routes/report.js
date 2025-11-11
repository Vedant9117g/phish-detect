// backend/api/src/routes/report.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const STORE = path.join(__dirname, "..", "..", "reports.json"); // backend/api/reports.json

router.post("/", (req, res) => {
  try {
    const payload = req.body;
    // payload.reports is expected to be an array
    const arr = Array.isArray(payload.reports) ? payload.reports : (payload ? [payload] : []);
    // read existing
    let existing = [];
    try {
      if (fs.existsSync(STORE)) {
        existing = JSON.parse(fs.readFileSync(STORE, "utf8") || "[]");
      }
    } catch (e) { existing = []; }
    const merged = arr.concat(existing);
    fs.writeFileSync(STORE, JSON.stringify(merged, null, 2), "utf8");
    console.log(`[REPORT] Stored ${arr.length} reports, total=${merged.length}`);
    res.json({ ok: true, stored: arr.length });
  } catch (err) {
    console.error("report error", err);
    res.status(500).json({ ok: false, error: err.toString() });
  }
});

module.exports = router;
