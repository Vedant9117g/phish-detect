// frontend/extension/content/predictor.js
// Minimal predictor helper exposing window.phishPredictor
window.phishPredictor = (function () {
  let _model = null;

  async function loadModel() {
    if (_model) return _model;
    try {
      // Use chrome.runtime.getURL to get the correct extension URL for the model file
      const url = chrome.runtime.getURL("model/rf_model.json");
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to load model JSON: ${resp.status}`);
      const json = await resp.json();
      // expected structure: { feature_names: [...], n_estimators: N, trees: [...] }
      _model = json;
      return _model;
    } catch (err) {
      console.error("phishPredictor.loadModel error:", err);
      throw err;
    }
  }

  // Convert features dict -> array ordered by model.feature_names
  function featuresDictToVector(feats, feature_names) {
    return feature_names.map(fn => {
      const v = (feats && Object.prototype.hasOwnProperty.call(feats, fn)) ? feats[fn] : 0;
      // ensure numeric
      return typeof v === "number" ? v : (v ? 1 : 0);
    });
  }

  // Very small inference: run forest and return votes & score (assuming binary)
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
    const total = votes[0] + votes[1] || 1;
    const score = (votes[1] || 0) / total;
    const label = score >= 0.5 ? 1 : 0;
    return { votes, score, label };
  }

  // helper to expose the loaded model
  function getModel() { return _model; }

  return { loadModel, getModel, featuresDictToVector, forestPredict };
})();
