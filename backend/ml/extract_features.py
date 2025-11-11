# backend/ml/extract_features.py
"""
Feature extractor for a single URL.
Returns a deterministic dict of numeric features.
"""
import re
import math
from collections import Counter
from urllib.parse import urlparse
import tldextract

def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    counts = Counter(s)
    ent = 0.0
    L = len(s)
    for c in counts:
        p = counts[c] / L
        ent -= p * math.log2(p)
    return ent

def has_ip_in_host(host: str) -> int:
    return 1 if re.match(r'^\d{1,3}(\.\d{1,3}){3}$', host) else 0

def extract_features(url: str) -> dict:
    """
    Returns features dict (stable key order used later by make_features.py).
    Keys:
      url_len, host_len, count_dots, count_subdirs, has_ip,
      count_at, count_hyphen, https, count_query_params, entropy_host, suspicious_word_count
    """
    try:
        u = url.strip()
        parsed = urlparse(u if "://" in u else "http://" + u)
        scheme = parsed.scheme.lower()
        hostname = parsed.hostname or ""
        path = parsed.path or ""
        query = parsed.query or ""

        # ensure we have a plain host (no port)
        host_only = hostname.split(":")[0] if hostname else ""

        features = {}
        features["url_len"] = len(u)
        features["host_len"] = len(host_only)
        features["count_dots"] = host_only.count(".")
        features["count_subdirs"] = len([seg for seg in path.split("/") if seg])
        features["has_ip"] = has_ip_in_host(host_only)
        features["count_at"] = 1 if "@" in u else 0
        features["count_hyphen"] = host_only.count("-")
        features["https"] = 1 if scheme == "https" else 0
        features["count_query_params"] = query.count("=")
        features["entropy_host"] = shannon_entropy(host_only)
        low = u.lower()
        suspicious_words = ["login", "verify", "update", "secure", "account", "bank", "signin", "confirm"]
        features["suspicious_word_count"] = sum(1 for w in suspicious_words if w in low)
        return features
    except Exception:
        return {
            "url_len": 0, "host_len": 0, "count_dots": 0, "count_subdirs": 0,
            "has_ip": 0, "count_at": 0, "count_hyphen": 0, "https": 0,
            "count_query_params": 0, "entropy_host": 0.0, "suspicious_word_count": 0
        }

# quick demo
if __name__ == "__main__":
    examples = [
        "https://www.google.com/search?q=test",
        "http://192.168.1.1:8080/admin",
        "http://secure-paypal.com/update_account",
    ]
    for e in examples:
        print(e, extract_features(e))
