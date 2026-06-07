from __future__ import annotations

import html
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "Bitirme_Tezi_Kitapcik_Artifact_Genis.md"
OUTPUT = ROOT / "Bitirme_Tezi_Mimari_Semalar.html"


CSS = """
:root {
  color-scheme: light;
  background: #ffffff;
  color: #111111;
}
body {
  margin: 0;
  background: #ffffff;
  color: #111111;
  font-family: "Times New Roman", Times, serif;
}
.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 36px 48px 72px;
}
h1 {
  text-align: center;
  font-size: 22pt;
  margin: 0 0 28px;
}
h2 {
  font-size: 16pt;
  margin: 28px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #d7dce2;
}
.diagram-card {
  break-inside: avoid;
  margin: 0 0 34px;
  padding: 18px;
  border: 1px solid #cfd6df;
  border-radius: 8px;
  background: #ffffff;
}
.mermaid {
  text-align: center;
  overflow-x: auto;
}
.mermaid svg {
  max-width: 100%;
  height: auto;
}
.note {
  color: #475569;
  text-align: center;
  margin-bottom: 24px;
}
"""


def extract_diagrams(md: str) -> list[tuple[str, str]]:
    pattern = re.compile(r"^## (Şema .+?)\n\n```mermaid\n(.*?)\n```", re.M | re.S)
    return [(title.strip(), code.strip()) for title, code in pattern.findall(md)]


def build() -> None:
    diagrams = extract_diagrams(INPUT.read_text(encoding="utf-8"))
    parts = [
        "<!doctype html>",
        '<html lang="tr">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>Bitirme Tezi Mimari Şemalar</title>",
        f"<style>{CSS}</style>",
        "</head>",
        "<body>",
        '<main class="page">',
        "<h1>Bitirme Tezi Mimari Şemalar</h1>",
        '<p class="note">Bu sayfa, tez içindeki Mermaid şemalarını ekran görüntüsü almak için beyaz zeminde render eder.</p>',
    ]

    for title, code in diagrams:
        parts.extend(
            [
                '<section class="diagram-card">',
                f"<h2>{html.escape(title)}</h2>",
                '<pre class="mermaid">',
                html.escape(code),
                "</pre>",
                "</section>",
            ]
        )

    parts.extend(
        [
            "</main>",
            '<script type="module">',
            'import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";',
            'mermaid.initialize({ startOnLoad: true, securityLevel: "loose", theme: "base", themeVariables: { fontFamily: "Times New Roman, serif", primaryColor: "#f8fafc", primaryTextColor: "#111111", primaryBorderColor: "#64748b", lineColor: "#475569", secondaryColor: "#eef6ff", tertiaryColor: "#ffffff" } });',
            "</script>",
            "</body>",
            "</html>",
        ]
    )
    OUTPUT.write_text("\n".join(parts), encoding="utf-8", newline="\n")
    print(OUTPUT)


if __name__ == "__main__":
    build()
