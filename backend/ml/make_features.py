# backend/ml/make_features.py
"""
Reads backend/data/urls_with_label.csv and writes backend/data/features.csv
Columns: feature1,...,featureN,label
"""
import os
import pandas as pd
from extract_features import extract_features

THIS_DIR = os.path.dirname(__file__)
BASE_DIR = os.path.normpath(os.path.join(THIS_DIR, ".."))
IN_PATH = os.path.join(BASE_DIR, "data", "urls_with_label.csv")
OUT_PATH = os.path.join(BASE_DIR, "data", "features.csv")

def main():
    if not os.path.exists(IN_PATH):
        raise FileNotFoundError(f"{IN_PATH} not found. Run build_dataset.py first.")
    df = pd.read_csv(IN_PATH)
    feature_rows = []
    feature_names = None

    for idx, row in df.iterrows():
        url = row['url']
        label = int(row['label'])
        feats = extract_features(url)
        if feature_names is None:
            feature_names = list(feats.keys())
        row_values = [feats.get(k, 0) for k in feature_names]
        feature_rows.append(row_values + [label])

    header = feature_names + ['label']
    out_df = pd.DataFrame(feature_rows, columns=header)
    out_df.to_csv(OUT_PATH, index=False)
    print(f"WROTE features -> {OUT_PATH}")
    print(f"Columns: {header}")
    print(f"Rows: {len(out_df)}")

if __name__ == "__main__":
    main()
