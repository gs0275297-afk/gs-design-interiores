"""Gera versões WebP/AVIF responsivas das fotos originais em Fotos-site/ -> public/img/."""
import os, json
from PIL import Image

SRC = "Fotos-site"
OUT = "public/img"
WIDTHS = [480, 800, 1200, 1600]  # + largura nativa: nunca amplia além do original

# prefixo do arquivo original -> nome semântico
MAP = {
    "0bf0dbbe": "lavabo-autoral",
    "195652a6": "living",
    "2af501ff": "gourmet",
    "5ca299b0": "banheiro-box",
    "79a01044": "lavabo-grafico",
    "8406e6d8": "lavabo-espelho",
    "3ad798ac": "petcenter-grooming",
    "8d3e1f52": "petcenter-atendimento",
    "aca9a492": "petcenter-banho",
    "acfb241c": "escritorio",
    "b1484793": "banheira",
    "d1b08a54": "suite-casal",
    "f113f8ef": "giovana-poltrona",
    "f21b107f": "quarto-duplo",
    "f9977276": "suite-casal-2",
    "fa0d8e78": "petcenter-banheiras",
}

os.makedirs(OUT, exist_ok=True)
manifest = {}
for f in sorted(os.listdir(SRC)):
    key = f[:8]
    if key not in MAP:
        continue
    im = Image.open(os.path.join(SRC, f)).convert("RGB")
    w, h = im.size
    widths = []
    for tw in WIDTHS + ([w] if w < WIDTHS[-1] else []):
        if tw > w:
            continue
        r = im.resize((tw, round(h * tw / w)), Image.LANCZOS) if tw != w else im
        widths.append(tw)
        base = f"{OUT}/{MAP[key]}-{tw}"
        r.save(base + ".webp", quality=88, method=6)
        r.save(base + ".avif", quality=72, speed=5, subsampling="4:4:4")
    manifest[MAP[key]] = {"w": w, "h": h, "widths": widths}
    print(MAP[key], w, h)

os.makedirs("src", exist_ok=True)
json.dump(manifest, open("src/images.json", "w"), indent=1)
