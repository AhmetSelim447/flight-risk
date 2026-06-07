from __future__ import annotations

import html
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "Bitirme_Tezi_Kitapcik_Artifact_Genis.md"
OUTPUT = ROOT / "Bitirme_Tezi_Kitapcik_Artifact_Genis_white.html"


CSS = """
:root {
  color-scheme: light;
  background: #ffffff;
  color: #111111;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: #ffffff;
  color: #111111;
  font-family: "Times New Roman", Times, serif;
  font-size: 12pt;
  line-height: 1.55;
}
.page {
  max-width: 900px;
  margin: 0 auto;
  padding: 48px 64px 72px;
  background: #ffffff;
}
h1, h2, h3 {
  color: #111111;
  page-break-after: avoid;
}
h1 {
  font-size: 20pt;
  text-align: center;
  margin: 32px 0 18px;
  border-bottom: 1px solid #d7dce2;
  padding-bottom: 8px;
}
h2 {
  font-size: 15pt;
  margin: 24px 0 10px;
}
h3 {
  font-size: 13pt;
  margin: 18px 0 8px;
}
p {
  margin: 0 0 10px;
  text-align: justify;
}
.cover p {
  text-align: center;
  margin-bottom: 12px;
}
strong {
  font-weight: 700;
}
code {
  font-family: Consolas, "Courier New", monospace;
  background: #f3f4f6;
  color: #111111;
  padding: 1px 4px;
  border-radius: 3px;
}
pre {
  background: #f8fafc;
  color: #111111;
  border: 1px solid #d7dce2;
  padding: 12px 14px;
  overflow-x: auto;
  white-space: pre;
  font-family: Consolas, "Courier New", monospace;
  font-size: 9.5pt;
  line-height: 1.35;
}
.mermaid-wrap {
  margin: 18px 0 28px;
  padding: 14px;
  border: 1px solid #cfd6df;
  border-radius: 8px;
  background: #ffffff;
  overflow-x: auto;
}
.mermaid {
  min-width: 680px;
  text-align: center;
}
.mermaid svg {
  max-width: 100%;
  height: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0 18px;
  background: #ffffff;
  color: #111111;
}
th, td {
  border: 1px solid #cfd6df;
  padding: 7px 9px;
  vertical-align: top;
}
th {
  background: #e8eef7;
  font-weight: 700;
}
tr:nth-child(even) td {
  background: #f8fafc;
}
ul, ol {
  margin: 0 0 12px 28px;
  padding: 0;
}
li {
  margin-bottom: 5px;
}
hr {
  border: 0;
  border-top: 1px solid #d7dce2;
  margin: 24px 0;
}
@media print {
  body, .page {
    background: #ffffff;
  }
  .page {
    max-width: none;
    padding: 0;
  }
  h1 {
    page-break-before: always;
  }
  h1:first-child {
    page-break-before: auto;
  }
}
"""


def inline_md(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    return escaped


def is_table_line(line: str) -> bool:
    stripped = line.strip()
    return stripped.startswith("|") and stripped.endswith("|")


def is_separator_row(parts: list[str]) -> bool:
    return all(re.fullmatch(r":?-{3,}:?", part.strip() or "") for part in parts)


def parse_table(lines: list[str], start: int) -> tuple[str, int]:
    rows: list[list[str]] = []
    i = start
    while i < len(lines) and is_table_line(lines[i]):
        parts = [p.strip() for p in lines[i].strip().strip("|").split("|")]
        if not is_separator_row(parts):
            rows.append(parts)
        i += 1
    if not rows:
        return "", i
    out = ["<table>"]
    for idx, row in enumerate(rows):
        tag = "th" if idx == 0 else "td"
        out.append("<tr>" + "".join(f"<{tag}>{inline_md(cell)}</{tag}>" for cell in row) + "</tr>")
    out.append("</table>")
    return "\n".join(out), i


def build() -> None:
    all_lines = INPUT.read_text(encoding="utf-8").splitlines()
    try:
        start_idx = next(i for i, value in enumerate(all_lines) if value.strip() == "# KAPAK")
        lines = all_lines[start_idx:]
    except StopIteration:
        lines = all_lines
    out: list[str] = [
        "<!doctype html>",
        '<html lang="tr">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>Bitirme Tezi Kitapçığı</title>",
        f"<style>{CSS}</style>",
        "</head>",
        "<body>",
        '<main class="page">',
    ]

    in_code = False
    code_lang = ""
    code_lines: list[str] = []
    in_cover = False
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if stripped.startswith("```"):
            if not in_code:
                in_code = True
                code_lang = stripped[3:].strip().lower()
                code_lines = []
            else:
                code_text = "\n".join(code_lines)
                if code_lang == "mermaid":
                    out.append(
                        '<div class="mermaid-wrap"><pre class="mermaid">'
                        + html.escape(code_text)
                        + "</pre></div>"
                    )
                else:
                    out.append("<pre><code>" + html.escape(code_text) + "</code></pre>")
                in_code = False
                code_lang = ""
            i += 1
            continue

        if in_code:
            code_lines.append(line)
            i += 1
            continue

        if not stripped:
            i += 1
            continue

        if stripped == "---":
            out.append("<hr>")
            i += 1
            continue

        if is_table_line(stripped):
            table_html, next_i = parse_table(lines, i)
            if table_html:
                out.append(table_html)
            i = next_i
            continue

        if stripped.startswith("# "):
            title = stripped[2:].strip()
            if title == "KAPAK":
                in_cover = True
                out.append('<section class="cover">')
            else:
                if in_cover:
                    out.append("</section>")
                    in_cover = False
                out.append(f"<h1>{inline_md(title)}</h1>")
            i += 1
            continue

        if stripped.startswith("## "):
            out.append(f"<h2>{inline_md(stripped[3:].strip())}</h2>")
            i += 1
            continue

        if stripped.startswith("### "):
            out.append(f"<h3>{inline_md(stripped[4:].strip())}</h3>")
            i += 1
            continue

        if stripped.startswith("- "):
            items = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                items.append("<li>" + inline_md(lines[i].strip()[2:]) + "</li>")
                i += 1
            out.append("<ul>" + "\n".join(items) + "</ul>")
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i].strip()):
                items.append("<li>" + inline_md(re.sub(r"^\d+\.\s+", "", lines[i].strip())) + "</li>")
                i += 1
            out.append("<ol>" + "\n".join(items) + "</ol>")
            continue

        out.append(f"<p>{inline_md(stripped)}</p>")
        i += 1

    if in_cover:
        out.append("</section>")
    out.extend(
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
    OUTPUT.write_text("\n".join(out), encoding="utf-8", newline="\n")
    print(OUTPUT)


if __name__ == "__main__":
    build()
