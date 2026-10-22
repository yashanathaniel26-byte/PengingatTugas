"""Backend pengingat deadline LMS (Moodle) berbasis export iCal.
Jalankan: pip install -r requirements.txt && python server.py
Buka: http://localhost:5000
"""
import os, re, time
from datetime import datetime, timezone, timedelta
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory

load_dotenv()
ICAL_URL = os.getenv("ICAL_URL", "")
CACHE_SEC = int(os.getenv("CACHE_MINUTES", "30")) * 60
app = Flask(__name__, static_folder="static")
_cache = {"t": 0, "data": []}

TYPES = [  # (kata kunci, tipe) - urutan = prioritas
    ("kelompok", "kelompok"), ("group", "kelompok"),
    ("quiz", "kuis"), ("kuis", "kuis"), ("ujian", "kuis"), ("uts", "kuis"), ("uas", "kuis"),
    ("forum", "forum"), ("diskusi", "forum"),
]

def classify(text: str) -> str:
    t = text.lower()
    for kw, typ in TYPES:
        if kw in t:
            return typ
    return "tugas"

def unescape(s: str) -> str:
    return (s.replace("\\n", "\n").replace("\\,", ",")
             .replace("\\;", ";").replace("\\\\", "\\"))

def parse_dt(v: str):
    v = v.strip()
    try:
        if v.endswith("Z"):
            return datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        if "T" in v:  # waktu lokal tanpa zona -> anggap WIB
            return datetime.strptime(v, "%Y%m%dT%H%M%S").replace(tzinfo=timezone(timedelta(hours=7)))
        return datetime.strptime(v, "%Y%m%d").replace(tzinfo=timezone(timedelta(hours=7)))
    except ValueError:
        return None

def parse_ics(text: str):
    text = re.sub(r"\r?\n[ \t]", "", text)  # unfold baris lanjutan
    events = []
    for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.S):
        f = {}
        for line in block.strip().splitlines():
            if ":" not in line:
                continue
            key, val = line.split(":", 1)
            f[key.split(";")[0].upper()] = val
        start = parse_dt(f.get("DTSTART", ""))
        if not start:
            continue
        title = unescape(f.get("SUMMARY", "(tanpa judul)"))
        desc = unescape(f.get("DESCRIPTION", ""))
        events.append({
            "id": f.get("UID", title + str(start)),
            "title": title,
            "course": unescape(f.get("CATEGORIES", "")) or "Umum",
            "type": classify(title + " " + desc),
            "due": start.isoformat(),
            "link": f.get("URL", ""),
            "desc": desc[:300],
        })
    events.sort(key=lambda e: e["due"])
    return events

@app.get("/api/deadlines")
def deadlines():
    if not ICAL_URL:
        return jsonify(error="ICAL_URL belum diisi di file .env"), 400
    if time.time() - _cache["t"] > CACHE_SEC:
        try:
            r = requests.get(ICAL_URL, timeout=30)
            r.raise_for_status()
            _cache.update(t=time.time(), data=parse_ics(r.text))
        except Exception as e:
            if not _cache["data"]:
                return jsonify(error=f"Gagal mengambil iCal: {e}"), 502
    return jsonify(updated=_cache["t"], items=_cache["data"])

@app.get("/")
def index():
    return send_from_directory("static", "index.html")

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
