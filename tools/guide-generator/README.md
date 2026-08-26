# User guide generator

Builds the six role PDFs in `docs/user-guides/` from Python source.

```bash
pip install pypdf
sudo apt-get install -y wkhtmltopdf poppler-utils
mkdir -p out
for f in guide_*.py; do python3 "$f"; done
```

- `mockup.py` — the SVG mockup engine. Design tokens are copied from
  `apps/web/tailwind.config.ts`; keep them in sync if the palette changes.
- `builder.py` — page CSS and the HTML→PDF step.
- `guide_*.py` — one file per role guide.

## Replacing mockups with screenshots

The illustrations are rendered mockups, because the application had not been
built when the guides were written. Once you have a running instance, capture
real screens and swap them in: replace a `g.mock(screen, caption)` call with a
figure pointing at a PNG, and delete the corresponding `Screen()` block. Remove
the disclaimer on the cover (`builder.py`, the `.meta` block) and in
`guide_index.py` once no mockups remain.
