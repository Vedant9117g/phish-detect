// frontend/extension/background/service-worker.js
// Listens for messages from content scripts (REPORT_SUSPECT) and popup (UPLOAD_REQUEST).
// Stores reports in chrome.storage.local under key 'phish_reports'.
// Optionally forwards to backend if requested.

console.log("PhishDetect background worker started");

function nowISO() {
  return new Date().toISOString();
}

async function getReports() {
  return new Promise(resolve => {
    chrome.storage.local.get(["phish_reports"], (res) => {
      resolve(Array.isArray(res.phish_reports) ? res.phish_reports : []);
    });
  });
}

async function setReports(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ phish_reports: arr }, () => resolve());
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) {
        sendResponse({ ok: false, error: "no type" });
        return;
      }

      if (msg.type === "REPORT_SUSPECT") {
        // content script requests a store of a report
        // expected fields: url, score, extra (optional)
        const url = msg.url || (sender && sender.tab && sender.tab.url) || "";
        const score = msg.score != null ? msg.score : (msg.result && msg.result.score);
        const extra = msg.extra || msg.result || null;
        const newReport = {
          id: `${Date.now()}-${Math.floor(Math.random()*10000)}`,
          ts: nowISO(),
          url,
          score,
          extra
        };
        const arr = await getReports();
        arr.unshift(newReport); // newest first
        await setReports(arr);
        sendResponse({ ok: true, stored: true, report: newReport });
        console.log("Stored phish report:", newReport);
        return;
      }

      if (msg.type === "GET_REPORTS") {
        const arr = await getReports();
        sendResponse({ ok: true, reports: arr });
        return;
      }

      if (msg.type === "CLEAR_REPORTS") {
        await setReports([]);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "UPLOAD_REPORTS") {
        // uploads stored reports to a backend URL passed via msg.apiUrl (string)
        const apiUrl = msg.apiUrl;
        if (!apiUrl) {
          sendResponse({ ok: false, error: "no apiUrl provided" });
          return;
        }
        const arr = await getReports();
        if (!arr.length) {
          sendResponse({ ok: true, uploaded: 0, message: "no reports" });
          return;
        }

        try {
          const resp = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reports: arr })
          });
          if (!resp.ok) {
            const text = await resp.text();
            sendResponse({ ok: false, error: `upload failed: ${resp.status} ${text}` });
            return;
          }
          // on success clear local storage
          await setReports([]);
          sendResponse({ ok: true, uploaded: arr.length });
        } catch (err) {
          sendResponse({ ok: false, error: err.toString() });
        }
        return;
      }

      // unknown type
      sendResponse({ ok: false, error: "unknown type" });
    } catch (e) {
      sendResponse({ ok: false, error: e.toString() });
    }
  })();
  // keep channel open for async sendResponse
  return true;
});
