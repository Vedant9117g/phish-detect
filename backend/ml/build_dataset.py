# backend/ml/build_dataset.py
"""
Merge raw lists of phishing and legitimate URLs into a single CSV with labels.
If no raw files are present, writes a small sample dataset.
Output: backend/data/urls_with_label.csv
"""
import os
import csv

SAMPLE = [
    ("http://example.com", 0),
    ("https://www.google.com", 0),
    ("http://malicious-login.example.com/secure-login", 1),
    ("http://192.168.0.1/admin", 1),
    ("https://www-bank-secure.tk/login", 1),
    ("https://github.com", 0),
    ("http://verify-paypal.example.org/signin", 1),
    ("https://stackoverflow.com", 0),
    ("http://secure-paypal.com/update_account", 1),
    ("https://wikipedia.org", 0),
]

THIS_DIR = os.path.dirname(__file__)
OUT_DIR = os.path.normpath(os.path.join(THIS_DIR, "..", "data"))
OUT_PATH = os.path.join(OUT_DIR, "urls_with_label.csv")

def ensure_data_dir():
    os.makedirs(OUT_DIR, exist_ok=True)

def write_csv(rows, outpath=OUT_PATH):
    with open(outpath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["url", "label"])
        for url, label in rows:
            writer.writerow([url.strip(), int(label)])
    print(f"WROTE {len(rows)} rows -> {outpath}")

def load_raw_file(path):
    with open(path, "r", encoding="utf-8") as f:
        lines = [l.strip() for l in f if l.strip()]
    return lines

def main():
    ensure_data_dir()
    phish_file = os.path.join(OUT_DIR, "raw_phish_urls.txt")
    legit_file = os.path.join(OUT_DIR, "raw_legit_urls.txt")

    if os.path.exists(phish_file) and os.path.exists(legit_file):
        phish = load_raw_file(phish_file)
        legit = load_raw_file(legit_file)
        rows = [(u, 1) for u in phish] + [(u, 0) for u in legit]
        print(f"Loaded {len(phish)} phishing and {len(legit)} legitimate URLs from raw files.")
    else:
        print("No raw files found -> creating sample dataset.")
        rows = SAMPLE

    # dedupe: if duplicates with conflicting labels, keep phishing label (1)
    dedup = {}
    for url, label in rows:
        key = url.strip().lower()
        dedup[key] = max(dedup.get(key, 0), int(label))

    final_rows = sorted([(u, dedup[u.strip().lower()]) for u,_ in rows if u.strip().lower() in dedup])
    # make unique and ordered
    unique_map = {}
    for u, l in final_rows:
        unique_map[u] = l
    final = sorted(unique_map.items())
    write_csv(final)

if __name__ == "__main__":
    main()
