// debug content.js - temporary
const DEBUG_THRESHOLD = 0.25; // lower for testing

(async function () {
    if (document.readyState === "loading") {
        await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }

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
        } catch (e) { console.error("Feature extraction error", e); return null; }
    }

    if (!window.phishPredictor || !window.phishPredictor.loadModel) {
        console.error("PhishPredictor unavailable. Ensure predictor.js is loaded before content.js in manifest.");
        return;
    }

    try {
        const model = await window.phishPredictor.loadModel();
        console.log("DEBUG model meta:", { feature_names: model.feature_names, n_estimators: model.n_estimators });

        const url = window.location.href;
        const feats = extractFeaturesFromUrl(url);
        console.log("DEBUG extracted features:", feats);

        const vector = window.phishPredictor.featuresDictToVector(feats, model.feature_names);
        console.log("DEBUG vector (ordered):", vector);

        const result = window.phishPredictor.forestPredict(vector);
        console.log("Phish-detect DEBUG:", { url, result });
        console.log("DEBUG votes:", result.votes);

        // store for popup
        try { sessionStorage.setItem("phish_detect_last", JSON.stringify({ url, result, ts: Date.now() })); } catch (e) { }

        if (result.score >= DEBUG_THRESHOLD) {
            injectDebugOverlay(result.score, feats, model.feature_names);
        }
    } catch (e) {
        console.error("Prediction error (debug):", e);
    }

    function injectDebugOverlay(score, feats, featureNames) {
        if (document.getElementById("phish-debug-overlay")) return;
        const o = document.createElement("div");
        o.id = "phish-debug-overlay";
        Object.assign(o.style, {
            position: "fixed", top: "10px", left: "10px", right: "10px", zIndex: 2147483647,
            background: "rgba(220,40,40,0.95)", color: "#fff", padding: "10px", borderRadius: "8px", fontFamily: "Segoe UI, Roboto, Arial"
        });
        o.innerHTML = `<strong>DEBUG PHISH (score ${(score * 100).toFixed(0)}%)</strong>
      <div style="font-size:12px;margin-top:6px">features: ${JSON.stringify(feats)}</div>
      <div style="font-size:12px;margin-top:6px">feature_names: ${JSON.stringify(featureNames)}</div>
      <div style="margin-top:8px"><button id="phish-debug-close">Close</button></div>`;
        document.body.appendChild(o);
        document.getElementById("phish-debug-close").onclick = () => o.remove();
    }
})();
