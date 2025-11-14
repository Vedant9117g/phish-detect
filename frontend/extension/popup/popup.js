// popup/popup.js - full behavior: thresholds, last detection, saved reports, send/clear/simulate
document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const lastEl = document.getElementById("last");
  const blockRange = document.getElementById("blockRange");
  const blockNum = document.getElementById("blockNum");
  const warnRange = document.getElementById("warnRange");
  const warnNum = document.getElementById("warnNum");
  const saveBtn = document.getElementById("save");
  const resetBtn = document.getElementById("reset");
  const refreshBtn = document.getElementById("refresh");
  const apiInput = document.getElementById("apiUrl");
  const sendBtn = document.getElementById("send");
  const clearBtn = document.getElementById("clear");
  const simulateBtn = document.getElementById("simulate");
  const reportsEl = document.getElementById("reports");

  // Defaults (percent)
  const DEFAULTS = { block: 50, warn: 35 };

  // Helpers
  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function scoreClass(score) {
    if (score >= 0.75) return "score-high";
    if (score >= 0.4) return "score-mid";
    return "score-low";
  }

  function setControlsFromObj(obj) {
    const b = typeof obj.block === "number" ? obj.block : DEFAULTS.block;
    const w = typeof obj.warn === "number" ? obj.warn : DEFAULTS.warn;
    blockRange.value = b; blockNum.value = b;
    warnRange.value = w; warnNum.value = w;
  }

  // Sync inputs
  blockRange.addEventListener("input", () => blockNum.value = blockRange.value);
  blockNum.addEventListener("input", () => {
    let v = Number(blockNum.value);
    if (isNaN(v)) v = DEFAULTS.block;
    v = Math.max(0, Math.min(100, v));
    blockNum.value = v; blockRange.value = v;
  });
  warnRange.addEventListener("input", () => warnNum.value = warnRange.value);
  warnNum.addEventListener("input", () => {
    let v = Number(warnNum.value);
    if (isNaN(v)) v = DEFAULTS.warn;
    v = Math.max(0, Math.min(100, v));
    warnNum.value = v; warnRange.value = v;
  });

  // Load thresholds and last detection
  function loadSettingsAndLast() {
    chrome.storage.local.get(["phish_thresholds", "phish_last"], (res) => {
      const thr = res.phish_thresholds || null;
      setControlsFromObj(thr || {});
      // Attempt to load last detection from storage (fallback to sessionStorage)
      const last = res.phish_last || sessionStorage.getItem("phish_detect_last");
      if (last) {
        try {
          const obj = typeof last === "string" ? JSON.parse(last) : last;
          const score = obj.result && obj.result.score != null ? Math.round((1 - obj.result.score) * 100) : null;
          const pctText = score != null ? `${score}% safe` : "N/A";
          lastEl.innerHTML = `${escapeHtml(obj.url || "Unknown")} — <span class="score-pill">${pctText}</span><div class="muted-small" style="margin-top:6px;">${escapeHtml(obj.ts || "")}</div>`;
        } catch (e) {
          lastEl.innerText = "No detection yet.";
        }
      } else {
        lastEl.innerText = "No detection yet.";
      }
    });
  }

  // Reports UI
  function setReportsLoading() {
    reportsEl.textContent = "Loading...";
  }

  function renderReports(arr) {
    if (!arr || !arr.length) {
      reportsEl.innerText = "No saved reports.";
      return;
    }
    reportsEl.innerHTML = "";
    for (const r of arr) {
      const d = document.createElement("div");
      d.className = "report";

      const score = r.score != null ? Math.round((1 - r.score) * 100) : "N/A"; // safety %
      const ts = r.ts ? escapeHtml(r.ts) : "";
      const id = escapeHtml(r.id || "");
      const url = escapeHtml(r.url || "");
      const extra = r.extra || r.result || null;

      d.innerHTML = `
        <div class="meta">
          <div style="flex:1">
            <div style="font-size:13px;"><b>${url}</b></div>
            <div class="muted-small" style="margin-top:4px;">${ts} • id: ${id}</div>
          </div>
          <div style="margin-left:8px; text-align:right;">
            <div class="score-pill">${score}%</div>
            <div style="margin-top:6px;"><button class="toggle">Details</button></div>
          </div>
        </div>
        <div class="details"></div>
      `;

      // attach toggle behaviour
      const toggleBtn = d.querySelector(".toggle");
      const detailsEl = d.querySelector(".details");
      toggleBtn.addEventListener("click", () => {
        if (detailsEl.style.display === "none" || !detailsEl.style.display) {
          // show details
          const detailsObj = {
            url: r.url,
            score: r.score,
            ts: r.ts,
            id: r.id,
            extra: r.extra || r.result || null
          };
          detailsEl.innerText = JSON.stringify(detailsObj, null, 2);
          detailsEl.style.display = "block";
          toggleBtn.textContent = "Hide";
        } else {
          detailsEl.style.display = "none";
          toggleBtn.textContent = "Details";
        }
      });

      reportsEl.appendChild(d);
    }
  }

  function loadReports() {
    setReportsLoading();
    chrome.runtime.sendMessage({ type: "GET_REPORTS" }, (res) => {
      if (!res || !res.ok) {
        reportsEl.innerText = "Failed to load reports.";
        return;
      }
      renderReports(res.reports || []);
    });
  }

  // Save thresholds
  saveBtn.addEventListener("click", () => {
    const block = Number(blockNum.value || DEFAULTS.block);
    const warn = Number(warnNum.value || DEFAULTS.warn);
    if (warn > block) {
      if (!confirm(`Warning threshold (${warn}%) is higher than blocking (${block}%). This might be unintended. Continue?`)) return;
    }
    const obj = { block, warn };
    chrome.storage.local.set({ phish_thresholds: obj }, () => {
      alert("Saved thresholds");
    });
  });

  resetBtn.addEventListener("click", () => {
    setControlsFromObj(DEFAULTS);
    chrome.storage.local.set({ phish_thresholds: { block: DEFAULTS.block, warn: DEFAULTS.warn } }, () => {
      alert("Reset to defaults");
    });
  });

  refreshBtn.addEventListener("click", () => {
    loadSettingsAndLast();
    loadReports();
  });

  // Send / Clear / Simulate
  sendBtn.addEventListener("click", () => {
    const url = apiInput.value.trim();
    if (!url) return alert("Enter backend URL (eg. http://localhost:3000/report)");
    sendBtn.disabled = true; sendBtn.textContent = "Uploading...";
    chrome.runtime.sendMessage({ type: "UPLOAD_REPORTS", apiUrl: url }, (res) => {
      sendBtn.disabled = false; sendBtn.textContent = "Send";
      if (!res) return alert("No response from background");
      if (!res.ok) return alert("Upload failed: " + (res.error || "unknown"));
      alert(`Uploaded ${res.uploaded || 0} reports`);
      loadReports();
    });
  });

  clearBtn.addEventListener("click", () => {
    if (!confirm("Clear all locally stored reports?")) return;
    chrome.runtime.sendMessage({ type: "CLEAR_REPORTS" }, (res) => {
      loadReports();
    });
  });

  simulateBtn.addEventListener("click", () => {
    simulateBtn.disabled = true; simulateBtn.textContent = "Simulating...";
    chrome.runtime.sendMessage({
      type: "REPORT_SUSPECT",
      url: "https://simulated-test.local/",
      score: 0.92,
      extra: { reason: "manual popup test", simulated: true }
    }, (res) => {
      simulateBtn.disabled = false; simulateBtn.textContent = "Simulate";
      alert("Simulated report added! Refreshing saved reports...");
      loadReports();
    });
  });

  // initial load
  loadSettingsAndLast();
  loadReports();
});
