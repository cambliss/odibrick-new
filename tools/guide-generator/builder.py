"""
Document builder: assembles a styled HTML page per role and hands it to
wkhtmltopdf. Layout deliberately avoids flexbox and CSS grid, which the
WebKit build inside wkhtmltopdf renders unreliably.
"""
import subprocess
from mockup import esc, INK, SEAL, SEAL_SOFT, OCHRE, OCHRE_SOFT, PAPER, LINE, MUTED, ALERT

CSS = """
@page { size: A4; margin: 20mm 16mm 18mm 16mm; }

body {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 9.6pt;
  line-height: 1.55;
  color: #12211C;
  margin: 0;
}

/* ---------------------------------------------------------------- cover */
.cover { page-break-after: always; padding-top: 26mm; }
.cover .brand { font-size: 26pt; font-weight: bold; letter-spacing: -0.5pt; }
.cover .promise {
  font-family: "DejaVu Sans Mono", monospace; font-size: 7.5pt;
  letter-spacing: 2pt; color: #B8862B; text-transform: uppercase; margin-top: 3mm;
}
.cover .rolebadge {
  display: inline-block; margin-top: 18mm; padding: 3mm 6mm;
  background: #E7EFEA; border: 1px solid #1F5D4C; border-radius: 20px;
  font-family: "DejaVu Sans Mono", monospace; font-size: 8pt;
  letter-spacing: 1.5pt; color: #143F34; text-transform: uppercase;
}
.cover h1 { font-size: 30pt; line-height: 1.05; margin: 6mm 0 0 0; font-weight: bold; }
.cover .lede { font-size: 11.5pt; color: #5B6B63; margin-top: 6mm; max-width: 130mm; }
.cover .meta {
  margin-top: 24mm; padding-top: 4mm; border-top: 1px solid #DCE1DC;
  font-family: "DejaVu Sans Mono", monospace; font-size: 7.5pt; color: #5B6B63;
}

/* ------------------------------------------------------------- headings */
h2 {
  font-size: 15pt; margin: 9mm 0 3mm 0; padding-bottom: 2mm;
  border-bottom: 2px solid #1F5D4C; page-break-after: avoid;
}
h3 {
  font-size: 11.5pt; margin: 7mm 0 2mm 0; page-break-after: avoid;
  color: #143F34;
}
h4 { font-size: 10pt; margin: 5mm 0 1.5mm 0; page-break-after: avoid; }
p { margin: 0 0 3mm 0; }
.eyebrow {
  font-family: "DejaVu Sans Mono", monospace; font-size: 7pt;
  letter-spacing: 1.6pt; text-transform: uppercase; color: #5B6B63;
  margin-bottom: 1mm;
}

/* ---------------------------------------------------------------- steps */
.step { margin: 0 0 6mm 0; page-break-inside: avoid; }
.step .num {
  display: inline-block; width: 7mm; height: 7mm; line-height: 7mm;
  text-align: center; background: #1F5D4C; color: #fff; border-radius: 50%;
  font-family: "DejaVu Sans Mono", monospace; font-size: 8pt; margin-right: 3mm;
}
.step .title { font-weight: bold; font-size: 10.5pt; }
.step .body { margin: 2mm 0 0 10mm; }
.step .body p { margin-bottom: 2mm; }

ul, ol { margin: 0 0 3mm 0; padding-left: 5mm; }
li { margin-bottom: 1.5mm; }

/* --------------------------------------------------------------- mocks */
.mock { margin: 4mm 0 5mm 0; page-break-inside: avoid; }
.mockframe { line-height: 0; }
.mockframe svg { display: block; }
figcaption {
  font-family: "DejaVu Sans Mono", monospace; font-size: 7pt; color: #5B6B63;
  margin-top: 1.5mm; text-transform: uppercase; letter-spacing: 0.8pt;
}

/* ------------------------------------------------------------- callouts */
.note, .warn, .tip {
  padding: 3mm 4mm; margin: 3mm 0 4mm 0; page-break-inside: avoid;
  border-left: 3px solid #1F5D4C; background: #F5F6F3; font-size: 9pt;
}
.warn { border-left-color: #9B3B2E; background: #F8EFED; }
.tip { border-left-color: #B8862B; background: #F6EEDC; }
.note .lbl, .warn .lbl, .tip .lbl {
  font-family: "DejaVu Sans Mono", monospace; font-size: 6.8pt;
  letter-spacing: 1.2pt; text-transform: uppercase; display: block;
  margin-bottom: 1mm; color: #5B6B63;
}
.warn .lbl { color: #9B3B2E; }
.tip .lbl { color: #B8862B; }

/* --------------------------------------------------------------- tables */
table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm 0; font-size: 8.8pt; }
th {
  text-align: left; background: #E7EFEA; padding: 2mm 2.5mm;
  border: 1px solid #DCE1DC; font-family: "DejaVu Sans Mono", monospace;
  font-size: 7pt; letter-spacing: 0.8pt; text-transform: uppercase;
}
td { padding: 2mm 2.5mm; border: 1px solid #DCE1DC; vertical-align: top; }
tr { page-break-inside: avoid; }

code {
  font-family: "DejaVu Sans Mono", monospace; font-size: 8.3pt;
  background: #F5F6F3; padding: 0.4mm 1.2mm; border: 1px solid #DCE1DC;
}

.pagebreak { page-break-before: always; }
.toc td { border: none; padding: 1.5mm 0; }
.toc .n {
  font-family: "DejaVu Sans Mono", monospace; color: #B8862B; width: 10mm;
}
.faq { margin-bottom: 4mm; page-break-inside: avoid; }
.faq .q { font-weight: bold; }
.faq .a { color: #5B6B63; }
"""


class Guide:
    def __init__(self, role, title, lede, audience):
        self.role = role
        self.title = title
        self.lede = lede
        self.audience = audience
        self.blocks = []

    # ------------------------------------------------------------ content
    def add(self, html):
        self.blocks.append(html)
        return self

    def h2(self, text):
        return self.add(f"<h2>{esc(text)}</h2>")

    def h3(self, text):
        return self.add(f"<h3>{esc(text)}</h3>")

    def h4(self, text):
        return self.add(f"<h4>{esc(text)}</h4>")

    def p(self, text):
        return self.add(f"<p>{text}</p>")

    def eyebrow(self, text):
        return self.add(f'<div class="eyebrow">{esc(text)}</div>')

    def step(self, n, title, body):
        return self.add(
            f'<div class="step"><span class="num">{n}</span>'
            f'<span class="title">{esc(title)}</span>'
            f'<div class="body">{body}</div></div>')

    def ul(self, items):
        lis = "".join(f"<li>{i}</li>" for i in items)
        return self.add(f"<ul>{lis}</ul>")

    def ol(self, items):
        lis = "".join(f"<li>{i}</li>" for i in items)
        return self.add(f"<ol>{lis}</ol>")

    def note(self, text, kind="note", label=None):
        labels = {"note": "Note", "warn": "Important", "tip": "Worth knowing"}
        lbl = label or labels[kind]
        return self.add(
            f'<div class="{kind}"><span class="lbl">{esc(lbl)}</span>{text}</div>')

    def table(self, headers, rows):
        head = "".join(f"<th>{esc(h)}</th>" for h in headers)
        body = "".join(
            "<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in rows)
        return self.add(f"<table><tr>{head}</tr>{body}</table>")

    def faq(self, pairs):
        for q, a in pairs:
            self.add(f'<div class="faq"><div class="q">{esc(q)}</div>'
                     f'<div class="a">{a}</div></div>')
        return self

    def mock(self, screen, caption):
        return self.add(screen.render(caption))

    def pagebreak(self):
        return self.add('<div class="pagebreak"></div>')

    def toc(self, entries):
        rows = "".join(
            f'<tr><td class="n">{i + 1}</td><td>{esc(e)}</td></tr>'
            for i, e in enumerate(entries))
        return self.add(f'<table class="toc">{rows}</table>')

    # ------------------------------------------------------------- output
    def html(self):
        cover = f"""
<div class="cover">
  <div class="brand">Odibrick</div>
  <div class="promise">Property, protected</div>
  <div class="rolebadge">{esc(self.role)}</div>
  <h1>{esc(self.title)}</h1>
  <div class="lede">{esc(self.lede)}</div>
  <div class="meta">
    WHO THIS IS FOR &nbsp;·&nbsp; {esc(self.audience)}<br/>
    VERSION 1.0 &nbsp;·&nbsp; CAMBLISS PVT. LTD.<br/><br/>
    ILLUSTRATIONS IN THIS GUIDE ARE RENDERED MOCKUPS OF THE INTERFACE,<br/>
    NOT PHOTOGRAPHS OF A RUNNING SYSTEM.
  </div>
</div>"""
        return (f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
                f"<style>{CSS}</style></head><body>{cover}"
                f"{''.join(self.blocks)}</body></html>")

    def build(self, path):
        html_path = path.replace(".pdf", ".html")
        with open(html_path, "w") as f:
            f.write(self.html())
        subprocess.run([
            "wkhtmltopdf", "--enable-local-file-access", "--quiet",




            html_path, path,
        ], check=True)
        return path
