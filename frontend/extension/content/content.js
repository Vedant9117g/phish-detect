// content/content.js
// Injects safety badge + possible blocking overlay and reports to background

const PHISH_THRESHOLD = 0.5;    // model score >= this is considered unsafe (adjustable)
const WARNING_THRESHOLD = 0.35; // lower threshold for showing prominent warning (you can tune)

(function () {
  try {
    console.log("PhishDetect CONTENT starting for", window.location.href);

    // small feature extractor
    function shannonEntropy(s) {
      if (!s) return 0;
      const counts = {};
      for (const ch of s) counts[ch] = (counts[ch] || 0) + 1;
      let ent = 0;
      const L = s.length;
      for (const k in counts) { const p = counts[k] / L; ent -= p * Math.log2(p); }
      return ent;
    }
    function hasIpInHost(host) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? 1 : 0; }

    function extractFeaturesFromUrl(url) {
      try {
        const u = new URL(url);
        const hostname = u.hostname || "";
        const path = u.pathname || "";
        const query = u.search || "";
        const features = {};
        features["url_len"] = url.length;
        features["host_len"] = hostname.length;
        features["count_dots"] = (hostname.match(/\./g) || []).length;
        features["count_subdirs"] = path.split("/").filter(Boolean).length;
        features["has_ip"] = hasIpInHost(hostname);
        features["count_at"] = url.includes("@") ? 1 : 0;
        features["count_hyphen"] = (hostname.match(/-/g) || []).length;
        features["https"] = u.protocol === "https:" ? 1 : 0;
        features["count_query_params"] = (query.match(/=/g) || []).length;
        features["entropy_host"] = shannonEntropy(hostname);
        const low = url.toLowerCase();
        const suspiciousWords = ["login", "verify", "update", "secure", "account", "bank", "signin", "confirm"];
        features["suspicious_word_count"] = suspiciousWords.reduce((acc, w) => acc + (low.includes(w) ? 1 : 0), 0);
        features["num_forms"] = document.querySelectorAll("form").length;
        features["has_password_input"] = document.querySelector('input[type="password"]') ? 1 : 0;
        return features;
      } catch (e) {
        console.error("PhishDetect: feature extraction error", e);
        return null;
      }
    }

    // UI helpers
    function makeBadge(safetyPercent, label, votes) {
      // badge top-left
      const id = "phish-safety-badge";
      let b = document.getElementById(id);
      if (!b) {
        b = document.createElement("div");
        b.id = id;
        b.style.position = "fixed";
        b.style.top = "8px";
        b.style.left = "8px";
        b.style.zIndex = 2147483646;
        b.style.padding = "6px 8px";
        b.style.borderRadius = "8px";
        b.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
        b.style.fontFamily = "Segoe UI, Roboto, Arial";
        b.style.fontSize = "13px";
        b.style.cursor = "pointer";
        document.body.appendChild(b);
        b.addEventListener("click", (e) => {
          // scroll to top or reveal overlay
          const ov = document.getElementById("phish-warning-overlay");
          if (ov) ov.style.display = "block";
        });
      }
      // color: green/orange/red
      let bg = "#198754"; // green
      if (safetyPercent < 60) bg = "#ff8c00";
      if (safetyPercent < 40) bg = "#dc3545";
      b.style.background = bg;
      b.style.color = "#fff";
      const votesText = votes ? ` • votes:${(votes[1]||0)}/${( (votes[0]||0) + (votes[1]||0) )}` : "";
      b.innerHTML = `<b>${safetyPercent}% safe</b>${votesText}<div style="font-size:11px; opacity:0.9;">${label}</div>`;
    }

    function injectWarningOverlay(safetyPct, score, feats, votes) {
      if (document.getElementById("phish-warning-overlay")) return;
      const overlay = document.createElement("div");
      overlay.id = "phish-warning-overlay";
      Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: 2147483647, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "18px", boxSizing: "border-box"
      });
      const box = document.createElement("div");
      Object.assign(box.style, { maxWidth: "920px", width: "100%", background: "#fff", borderRadius: "10px", padding: "18px", boxSizing: "border-box", boxShadow: "0 6px 30px rgba(0,0,0,0.4)", color: "#111", fontFamily: "Segoe UI, Roboto, Arial" });
      box.innerHTML = `
        <div style="display:flex; gap:14px; align-items:center;">
          <div style="flex:1">
            <div style="font-size:20px; font-weight:700; margin-bottom:6px;">This site looks suspicious</div>
            <div style="font-size:14px; margin-bottom:8px;">Phishing risk: ${(Math.round(score*100))}% • Safety: ${safetyPct}%</div>
            <div style="font-size:13px; color:#333;">We recommend you do not enter credentials or personal info on this page.</div>
            <div style="margin-top:12px; font-size:13px;">
              <b>Key parameters:</b>
              <div style="margin-top:6px; font-family:monospace; font-size:12px; max-height:160px; overflow:auto; background:#f6f6f8; padding:8px; border-radius:6px; border:1px solid #eee;">${escapeHtml(JSON.stringify(feats || {}, null, 2))}</div>
            </div>
          </div>
          <div style="width:220px; display:flex; flex-direction:column; gap:8px; align-items:stretch;">
            <button id="phish-proceed" style="padding:10px; border-radius:8px; border:1px solid #ccc; background:#fff; cursor:pointer;">Proceed anyway</button>
            <button id="phish-report" style="padding:10px; border-radius:8px; border:0; background:#dc3545; color:#fff; cursor:pointer;">Report site</button>
            <button id="phish-close" style="padding:10px; border-radius:8px; border:0; background:#6c757d; color:#fff; cursor:pointer;">Close</button>
          </div>
        </div>
      `;
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      document.getElementById("phish-close").onclick = () => overlay.remove();
      document.getElementById("phish-proceed").onclick = () => overlay.remove();
      document.getElementById("phish-report").onclick = async () => {
        // send report to background
        const msg = { type: "REPORT_SUSPECT", url: window.location.href, score, extra: { features: feats, votes } };
        try { chrome.runtime.sendMessage(msg, (r) => { alert("Reported — saved locally."); overlay.remove(); }); } catch (e) { alert("Reporting failed: " + e); }
      };
    }

    function escapeHtml(s) {
      if (!s && s !== 0) return "";
      return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    }

    // main
    (async () => {
      if (!window.phishPredictor || !window.phishPredictor.loadModel) {
        console.error("PhishDetect: predictor missing. Make sure content/predictor.js is loaded before content.js in manifest.");
        return;
      }

      let model;
      try {
        model = await window.phishPredictor.loadModel();
      } catch (e) {
        console.error("PhishDetect: model load failed", e);
        // still show badge indicating unknown
        makeBadge(0, "model error", null);
        return;
      }

      const url = window.location.href;
      const feats = extractFeaturesFromUrl(url);
      if (!feats) {
        makeBadge(100, "no features", null);
        return;
      }

      const vector = window.phishPredictor.featuresDictToVector(feats, model.feature_names || []);
      const result = window.phishPredictor.forestPredict(vector);
      console.log("PhishDetect prediction:", { url, result, features: feats });

      // safety percent = 100 - (score*100) so higher = safer
      const safetyPct = Math.max(0, Math.min(100, Math.round((1 - result.score) * 100)));
      const label = result.score >= PHISH_THRESHOLD ? "Unsafe" : (result.score >= WARNING_THRESHOLD ? "Suspicious" : "Likely safe");

      // UI: badge always, overlay if above threshold
      makeBadge(safetyPct, label, result.votes);
      sessionStorage.setItem("phish_detect_last", JSON.stringify({ url, result, features: feats, ts: new Date().toISOString() }));

      // Send quick report to background for tracking if suspicious
      if (result.score >= WARNING_THRESHOLD) {
        try {
          chrome.runtime.sendMessage({ type: "REPORT_SUSPECT", url, score: result.score, extra: { features: feats, votes: result.votes } }, (r) => {});
        } catch (e) { /* ignore */ }
      }

      // show overlay for truly unsafe sites
      if (result.score >= PHISH_THRESHOLD) {
        injectWarningOverlay(safetyPct, result.score, feats, result.votes);
      }

    })();

  } catch (e) {
    console.error("PhishDetect content top-level error:", e);
  }
})();
