// content/predictor.js
// Minimal predictor helper exposing window.phishPredictor
window.phishPredictor = (function () {
  let _model = null;

  async function loadModel() {
    if (_model) return _model;
    try {
      const url = chrome.runtime.getURL("model/rf_model.json");
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to load model JSON: ${resp.status}`);
      const json = await resp.json();
      _model = json; // expected: { feature_names: [...], n_estimators: N, trees: [...] }
      return _model;
    } catch (err) {
      console.error("phishPredictor.loadModel error (fetching model):", err);
      throw err;
    }
  }

  function featuresDictToVector(feats, feature_names) {
    return feature_names.map(fn => {
      const v = (feats && Object.prototype.hasOwnProperty.call(feats, fn)) ? feats[fn] : 0;
      return typeof v === "number" ? v : (v ? 1 : 0);
    });
  }

  function forestPredict(vector) {
    if (!_model) throw new Error("Model not loaded. Call loadModel() first.");
    const trees = _model.trees || [];
    const votes = { 0: 0, 1: 0 };
    for (const t of trees) {
      let node = t;
      while (!node.leaf) {
        const fi = node.feature_index;
        const thr = node.threshold;
        node = (vector[fi] <= thr) ? node.left : node.right;
      }
      const pred = node.prediction;
      votes[pred] = (votes[pred] || 0) + 1;
    }
    const total = (votes[0] + votes[1]) || 1;
    const score = (votes[1] || 0) / total; // phishing probability
    const label = score >= 0.5 ? 1 : 0;
    return { votes, score, label };
  }

  function getModel() { return _model; }

  return { loadModel, getModel, featuresDictToVector, forestPredict };
})();
