"""Prepare the selected original-size exercise media from the pinned dataset."""
import hashlib
import io
import json
from pathlib import Path
import sys
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
selected = json.loads((root / "lib/gym/catalog.curated.json").read_text(encoding="utf-8"))
out = root / "public/folio/gym-visual"
out.mkdir(exist_ok=True, parents=True)
revision = "7455efae41b330c265e7cd4b78dfa848e7ce5ebd"

def prepare(read):
    records = {row["id"]: row for row in json.loads(read("data/exercises.json"))}
    for exercise in selected:
        code = exercise["code"]
        for field, suffix in [("image", "jpg"), ("gif_url", "gif")]:
            content = read(records[code][field])
            (out / f"{code}.{suffix}").write_bytes(content)
    (out / "NOTICE.md").write_bytes(read("NOTICE.md"))
    (out / "LICENSE").write_bytes(read("LICENSE"))

if len(sys.argv) == 2:
    source = Path(sys.argv[1])
    prepare(lambda name: (source / name).read_bytes())
else:
    url = f"https://codeload.github.com/hasaneyldrm/exercises-dataset/zip/{revision}"
    with urllib.request.urlopen(url, timeout=120) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != "31de382553bb641bb8ccd76623f3719fae23cb3c9b940ce344731eedf528f963":
        raise ValueError("Exercise media archive checksum mismatch")
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        prepare(lambda name: bundle.read(f"exercises-dataset-{revision}/{name}"))
