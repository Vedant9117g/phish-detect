# backend/ml/train_rf.py
"""
Train a RandomForest on backend/data/features.csv and export:
 - backend/models/rf_model.joblib  (sklearn model)
 - backend/models/rf_model.json    (JSON-serializable trees for in-browser inference)
Usage:
    python train_rf.py
Optional flags (edit below or add argparse if you want):
    n_estimators, max_depth, test_size, random_state
"""
import os
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import joblib

# Config (edit if needed)
BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
DATA_PATH = os.path.join(BASE_DIR, "data", "features.csv")
OUT_DIR = os.path.join(BASE_DIR, "models")
JOBLIB_PATH = os.path.join(OUT_DIR, "rf_model.joblib")
JSON_PATH = os.path.join(OUT_DIR, "rf_model.json")

N_ESTIMATORS = 100
MAX_DEPTH = 12
TEST_SIZE = 0.2
RANDOM_STATE = 42

def ensure_out_dir():
    os.makedirs(OUT_DIR, exist_ok=True)

def load_dataset(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Features file not found: {path}\nRun backend/ml/make_features.py first.")
    df = pd.read_csv(path)
    if 'label' not in df.columns:
        raise ValueError("features.csv must contain a 'label' column.")
    feature_cols = [c for c in df.columns if c != 'label']
    X = df[feature_cols].values
    y = df['label'].values.astype(int)
    return X, y, feature_cols

def train_rf(X_train, y_train, n_estimators=N_ESTIMATORS, max_depth=MAX_DEPTH, random_state=RANDOM_STATE):
    clf = RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth,
                                 random_state=random_state, n_jobs=-1)
    clf.fit(X_train, y_train)
    return clf

def tree_to_dict(estimator):
    """
    Convert a sklearn DecisionTree (estimator.tree_) into a nested dict.
    Node format:
      - internal: {"leaf": False, "feature_index": int, "threshold": float, "left": {...}, "right": {...}}
      - leaf: {"leaf": True, "prediction": int, "value": [counts_per_class]}
    """
    tree = estimator.tree_
    left = tree.children_left
    right = tree.children_right
    feature = tree.feature
    threshold = tree.threshold
    value = tree.value

    def node_to_dict(node):
        if left[node] == -1 and right[node] == -1:
            counts = value[node][0].astype(int).tolist()
            pred = int(np.argmax(counts))
            return {"leaf": True, "prediction": pred, "value": counts}
        else:
            return {
                "leaf": False,
                "feature_index": int(feature[node]),
                "threshold": float(threshold[node]),
                "left": node_to_dict(int(left[node])),
                "right": node_to_dict(int(right[node]))
            }
    return node_to_dict(0)

def export_forest_to_json(model, feature_names, out_path=JSON_PATH):
    """
    Exports the forest to JSON:
    {
      "feature_names": [...],
      "n_estimators": N,
      "trees": [ tree1_dict, tree2_dict, ... ]
    }
    """
    forest = []
    for est in model.estimators_:
        forest.append(tree_to_dict(est))
    model_json = {
        "feature_names": feature_names,
        "n_estimators": len(forest),
        "trees": forest
    }
    # Write pretty but can be large; if you want smaller, use separators=(',',':') and no indent
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(model_json, f, indent=2)
    print(f"Exported RF JSON to {out_path} (size: {os.path.getsize(out_path)/1024:.1f} KB)")

def main():
    print("Loading dataset:", DATA_PATH)
    X, y, feature_names = load_dataset(DATA_PATH)
    print(f"Dataset loaded. Samples: {X.shape[0]}, Features: {len(feature_names)}")
    # train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, stratify=y if len(np.unique(y))>1 else None, random_state=RANDOM_STATE)
    print(f"Train samples: {X_train.shape[0]}, Test samples: {X_test.shape[0]}")

    # train
    print(f"Training RandomForest: n_estimators={N_ESTIMATORS}, max_depth={MAX_DEPTH}")
    clf = train_rf(X_train, y_train, n_estimators=N_ESTIMATORS, max_depth=MAX_DEPTH)

    # evaluate
    y_pred = clf.predict(X_test)
    print("\nClassification report (test set):")
    print(classification_report(y_test, y_pred, digits=4))

    # confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    print("Confusion matrix:\n", cm)

    # ROC AUC if possible
    try:
        if hasattr(clf, "predict_proba"):
            proba = clf.predict_proba(X_test)[:, 1]
            auc = roc_auc_score(y_test, proba)
            print(f"ROC AUC: {auc:.4f}")
    except Exception as e:
        print("ROC AUC not available:", e)

    # persist model
    ensure_out_dir()
    print(f"Saving joblib model to {JOBLIB_PATH}")
    joblib.dump(clf, JOBLIB_PATH)
    print("Saved joblib model.")

    # export to JSON for frontend
    print("Exporting model to JSON for frontend usage (this can be large).")
    export_forest_to_json(clf, feature_names, JSON_PATH)
    print("Done.")

if __name__ == "__main__":
    main()
