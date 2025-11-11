// popup/popup.js
document.addEventListener("DOMContentLoaded", () => {
  const lastEl = document.getElementById("last");
  const refreshBtn = document.getElementById("refresh");
  const clearBtn = document.getElementById("clear");
  const reportsEl = document.getElementById("reports");
  const sendBtn = document.getElementById("send");
  const apiInput = document.getElementById("apiUrl");
  const simulateBtn = document.getElementById("simulate");

  function escapeHtml(s) {
    if (!s && s !== 0) return "";
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function scoreClass(score) {
    if (score >= 0.75) return "score-high";
    if (score >= 0.4) return "score-mid";
    return "score-low";
  }

  async function loadLast() {
    try {
      const raw = sessionStorage.getItem("phish_detect_last");
      if (!raw) {
        lastEl.innerHTML = `<div class="muted">No detection yet.</div>`;
        return;
      }
      const obj = JSON.parse(raw);
      const result = obj.result || {};
      const score = (result.score || 0);
      const pct = Math.round(score * 100);
      const votes = result.votes || {};
      const ts = obj.ts ? new Date(obj.ts).toLocaleString() : "";
      // features if present
      const features = obj.features || obj.result && obj.result.features || null;
      // Some content scripts store features in extra/result; adapt defensively:
      const extra = obj.result && obj.result.extra || obj.extra || null;

      lastEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="flex:1">
            <div><b>${escapeHtml(obj.url)}</b></div>
            <div class="small muted">${escapeHtml(ts)}</div>
          </div>
          <div style="margin-left:8px">
            <div class="score-pill ${scoreClass(score)}">${pct}%</div>
          </div>
        </div>
        <div style="margin-top:8px; font-size:12px;">
          <b>Votes:</b> ${escapeHtml(JSON.stringify(votes))}
        </div>
        ${features ? `<div style="margin-top:6px; font-size:12px;"><b>Features:</b><pre style="font-size:11px; margin:6px 0 0 0;">${escapeHtml(JSON.stringify(features, null, 2))}</pre></div>` : (extra ? `<div style="margin-top:6px; font-size:12px;"><b>Extra:</b><pre style="font-size:11px; margin:6px 0 0 0;">${escapeHtml(JSON.stringify(extra, null, 2))}</pre></div>` : "")}
      `;
    } catch (e) {
      lastEl.textContent = "No detection yet.";
    }
  }

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

      const score = r.score != null ? (Math.round(r.score * 100)) : "N/A";
      const ts = r.ts ? escapeHtml(r.ts) : "";
      const id = escapeHtml(r.id || "");
      const url = escapeHtml(r.url || "");
      const extra = r.extra || r.result || null;

      d.innerHTML = `
        <div class="meta">
          <div style="flex:1">
            <div style="font-size:13px;"><b>${url}</b></div>
            <div class="muted" style="margin-top:4px;">${ts} • id: ${id}</div>
          </div>
          <div style="margin-left:8px; text-align:right;">
            <div class="score-pill ${scoreClass(r.score || 0)}">${score}%</div>
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

  refreshBtn && refreshBtn.addEventListener("click", () => {
    loadLast();
    loadReports();
  });

  clearBtn && clearBtn.addEventListener("click", () => {
    if (!confirm("Clear all locally stored reports?")) return;
    chrome.runtime.sendMessage({ type: "CLEAR_REPORTS" }, (res) => {
      loadReports();
    });
  });

  sendBtn && sendBtn.addEventListener("click", () => {
    const url = apiInput.value.trim();
    if (!url) {
      alert("Enter backend URL (eg. http://localhost:3000/report) to upload.");
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = "Uploading...";
    chrome.runtime.sendMessage({ type: "UPLOAD_REPORTS", apiUrl: url }, (res) => {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
      if (!res) return alert("No response from background");
      if (!res.ok) {
        return alert("Upload failed: " + (res.error || "unknown"));
      }
      alert(`Uploaded ${res.uploaded || 0} reports`);
      loadReports();
    });
  });

  if (simulateBtn) {
    simulateBtn.addEventListener("click", () => {
      simulateBtn.disabled = true;
      simulateBtn.textContent = "Simulating...";
      chrome.runtime.sendMessage(
        {
          type: "REPORT_SUSPECT",
          url: "https://simulated-test.local/",
          score: 0.92,
          extra: { reason: "manual popup test", simulated: true }
        },
        (res) => {
          simulateBtn.disabled = false;
          simulateBtn.textContent = "Simulate report";
          console.log("Simulated REPORT_SUSPECT response:", res);
          alert("Simulated report added! Refreshing saved reports...");
          loadReports();
        }
      );
    });
  }

  // initial load
  loadLast();
  loadReports();
});
