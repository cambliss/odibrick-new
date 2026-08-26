"""
SVG mockup engine for the Odibrick user guides.

These are RENDERED MOCKUPS, not screenshots. The application has never been
built or run, so no running instance exists to photograph. Every colour,
font and component shape here is taken from the real source:
apps/web/tailwind.config.ts and apps/web/components/ui/index.tsx.
"""

# Design tokens, copied from apps/web/tailwind.config.ts
INK = "#12211C"
SEAL = "#1F5D4C"
SEAL_DEEP = "#143F34"
SEAL_SOFT = "#E7EFEA"
OCHRE = "#B8862B"
OCHRE_SOFT = "#F6EEDC"
PAPER = "#F5F6F3"
LINE = "#DCE1DC"
MUTED = "#5B6B63"
ALERT = "#9B3B2E"
INFO = "#2C5A78"
WHITE = "#FFFFFF"

# Width of the A4 text column in wkhtmltopdf CSS pixels, measured.
PRINT_W = 990

SANS = "DejaVu Sans"
MONO = "DejaVu Sans Mono"


def esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


class Screen:
    """A stacking layout builder that emits one SVG element."""

    def __init__(self, width=660, pad=0, bg=PAPER):
        self.w = width
        self.pad = pad
        self.bg = bg
        self.parts = []
        self.y = 0

    # ---------------------------------------------------------- primitives
    def _rect(self, x, y, w, h, fill, stroke=None, rx=3, sw=1, dash=None):
        s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
        if stroke:
            s += f' stroke="{stroke}" stroke-width="{sw}"'
        if dash:
            s += f' stroke-dasharray="{dash}"'
        self.parts.append(s + "/>")

    def _text(self, x, y, text, size=11, fill=INK, family=SANS,
              anchor="start", weight="normal", spacing=None):
        s = (f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
             f'fill="{fill}" text-anchor="{anchor}"')
        if weight != "normal":
            s += f' font-weight="{weight}"'
        if spacing:
            s += f' letter-spacing="{spacing}"'
        self.parts.append(s + f">{esc(text)}</text>")

    def _line(self, x1, y1, x2, y2, stroke=LINE, sw=1, dash=None):
        s = (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
             f'stroke="{stroke}" stroke-width="{sw}"')
        if dash:
            s += f' stroke-dasharray="{dash}"'
        self.parts.append(s + "/>")

    def gap(self, h=10):
        self.y += h
        return self

    # ------------------------------------------------------------ chrome
    def browser(self, url="odibrick.com"):
        """Browser chrome bar so a reader knows this is a web page."""
        self._rect(0, self.y, self.w, 26, "#E8EAE7", LINE, rx=0)
        for i, c in enumerate(["#D9635A", "#DFAE4A", "#6FAE6A"]):
            self.parts.append(
                f'<circle cx="{14 + i * 13}" cy="{self.y + 13}" r="4" fill="{c}"/>')
        self._rect(56, self.y + 6, self.w - 68, 14, WHITE, LINE, rx=7)
        self._text(64, self.y + 16, url, 8, MUTED, MONO)
        self.y += 26
        return self

    def appbar(self, user=None, dark=False):
        """The signed-in header from components/site-header.tsx."""
        bg = INK if dark else WHITE
        fg = WHITE if dark else INK
        self._rect(0, self.y, self.w, 34, bg, LINE, rx=0)
        self._text(14, self.y + 22, "Odibrick", 13, fg, SANS, weight="bold")
        self._text(88, self.y + 21, "PROPERTY, PROTECTED", 6,
                   OCHRE if dark else MUTED, MONO, spacing="1.4")
        if user:
            self._text(self.w - 14, self.y + 21, user, 9,
                       WHITE if dark else MUTED, SANS, anchor="end")
        self.y += 34
        return self

    def eyebrow(self, text):
        self._text(self.pad + 14, self.y + 10, text.upper(), 6.5, MUTED,
                   MONO, spacing="1.5")
        self.y += 16
        return self

    def h1(self, text, size=17):
        self._text(self.pad + 14, self.y + size, text, size, INK, SANS, weight="bold")
        self.y += size + 8
        return self

    def h2(self, text):
        self._text(self.pad + 14, self.y + 12, text, 12, INK, SANS, weight="bold")
        self.y += 22
        return self

    def para(self, text, size=9, fill=MUTED):
        self._text(self.pad + 14, self.y + size, text, size, fill)
        self.y += size + 6
        return self

    # ------------------------------------------------------------ widgets
    def field(self, label, value="", w=None, hint=None, focused=False):
        x = self.pad + 14
        w = w or (self.w - 28 - self.pad * 2)
        self._text(x, self.y + 9, label, 8.5, INK, SANS, weight="bold")
        self.y += 14
        self._rect(x, self.y, w, 22, WHITE, SEAL if focused else LINE,
                   sw=1.5 if focused else 1)
        self._text(x + 8, self.y + 15, value or "", 9,
                   INK if value else "#9AA79F")
        self.y += 24
        if hint:
            self._text(x, self.y + 7, hint, 7.5, MUTED)
            self.y += 12
        return self

    def field_row(self, specs):
        """specs: [(label, value, width), ...] laid out on one row."""
        x = self.pad + 14
        top = self.y
        maxy = self.y
        for label, value, w in specs:
            self._text(x, top + 9, label, 8.5, INK, SANS, weight="bold")
            self._rect(x, top + 14, w, 22, WHITE, LINE)
            self._text(x + 8, top + 29, value or "", 9, INK if value else "#9AA79F")
            maxy = max(maxy, top + 38)
            x += w + 10
        self.y = maxy
        return self

    def button(self, label, variant="primary", x=None, w=None, inline=False):
        x = self.pad + 14 if x is None else x
        w = w or max(70, len(label) * 5.6 + 24)
        if variant == "primary":
            self._rect(x, self.y, w, 24, SEAL)
            self._text(x + w / 2, self.y + 16, label, 9, WHITE, anchor="middle")
        elif variant == "secondary":
            self._rect(x, self.y, w, 24, WHITE, LINE)
            self._text(x + w / 2, self.y + 16, label, 9, INK, anchor="middle")
        elif variant == "danger":
            self._rect(x, self.y, w, 24, ALERT)
            self._text(x + w / 2, self.y + 16, label, 9, WHITE, anchor="middle")
        else:  # ghost
            self._text(x, self.y + 16, label, 9, SEAL)
        if not inline:
            self.y += 30
        return x + w + 8

    def buttons(self, specs):
        """specs: [(label, variant), ...] laid out on one row."""
        x = self.pad + 14
        for label, variant in specs:
            x = self.button(label, variant, x=x, inline=True)
        self.y += 30
        return self

    def badge(self, label, tone="neutral", x=None, inline=False):
        x = self.pad + 14 if x is None else x
        fills = {
            "neutral": (PAPER, MUTED, LINE),
            "seal": (SEAL_SOFT, SEAL_DEEP, SEAL),
            "ochre": (OCHRE_SOFT, OCHRE, OCHRE),
            "alert": ("#F4E7E4", ALERT, ALERT),
            "info": ("#E5EDF2", INFO, INFO),
        }
        bg, fg, st = fills[tone]
        w = len(label) * 4.5 + 16
        self._rect(x, self.y, w, 15, bg, st, rx=7)
        self._text(x + w / 2, self.y + 11, label.upper(), 6.5, fg, MONO,
                   anchor="middle", spacing="0.6")
        if not inline:
            self.y += 20
        return x + w + 5

    def badges(self, specs):
        x = self.pad + 14
        for label, tone in specs:
            x = self.badge(label, tone, x=x, inline=True)
        self.y += 20
        return self

    def card(self, title, lines, tone=None, h=None, note=None):
        x = self.pad + 14
        w = self.w - 28 - self.pad * 2
        bg, stroke = WHITE, LINE
        if tone == "ochre":
            bg, stroke = OCHRE_SOFT, OCHRE
        elif tone == "seal":
            bg, stroke = SEAL_SOFT, SEAL
        elif tone == "alert":
            bg, stroke = "#F8EFED", ALERT
        height = h or (30 + len(lines) * 13 + (14 if note else 0))
        self._rect(x, self.y, w, height, bg, stroke)
        self._text(x + 10, self.y + 17, title, 10, INK, SANS, weight="bold")
        yy = self.y + 32
        for ln in lines:
            self._text(x + 10, yy, ln, 8.5, MUTED)
            yy += 13
        if note:
            self._text(x + 10, yy + 2, note, 7.5, OCHRE if tone == "ochre" else MUTED, MONO)
        self.y += height + 10
        return self

    def datarows(self, rows, title=None):
        x = self.pad + 14
        w = self.w - 28 - self.pad * 2
        h = (22 if title else 8) + len(rows) * 17 + 8
        self._rect(x, self.y, w, h, WHITE, LINE)
        yy = self.y + (20 if title else 12)
        if title:
            self._text(x + 10, yy - 4, title.upper(), 6.5, MUTED, MONO, spacing="1.4")
            yy += 10
        for label, value in rows:
            self._text(x + 10, yy, label.upper(), 6.5, MUTED, MONO, spacing="0.8")
            self._text(x + w - 10, yy, value, 8.5, INK, SANS, anchor="end")
            self._line(x + 10, yy + 5, x + w - 10, yy + 5, "#EDF0EC")
            yy += 17
        self.y += h + 10
        return self

    def table(self, headers, rows, widths=None):
        x = self.pad + 14
        w = self.w - 28 - self.pad * 2
        n = len(headers)
        widths = widths or [w / n] * n
        h = 20 + len(rows) * 17 + 6
        self._rect(x, self.y, w, h, WHITE, LINE)
        cx = x + 10
        for i, head in enumerate(headers):
            self._text(cx, self.y + 15, head.upper(), 6.5, MUTED, MONO, spacing="0.8")
            cx += widths[i]
        self._line(x, self.y + 20, x + w, self.y + 20, LINE)
        yy = self.y + 34
        for row in rows:
            cx = x + 10
            for i, cell in enumerate(row):
                self._text(cx, yy, cell, 8.5, INK)
                cx += widths[i]
            self._line(x + 10, yy + 5, x + w - 10, yy + 5, "#EDF0EC")
            yy += 17
        self.y += h + 10
        return self

    def spine(self, events):
        """The record spine — Odibrick's signature element."""
        x = self.pad + 26
        top = self.y + 6
        bottom = self.y + len(events) * 30 - 8
        self._line(x, top, x, bottom, LINE)
        yy = self.y + 8
        for label, detail, state in events:
            fill = {"done": SEAL, "current": OCHRE}.get(state, PAPER)
            stroke = {"done": SEAL, "current": OCHRE}.get(state, LINE)
            self.parts.append(
                f'<circle cx="{x}" cy="{yy}" r="5" fill="{fill}" '
                f'stroke="{stroke}" stroke-width="1.6"/>')
            self._text(x + 16, yy - 2, detail.upper(), 6.5, MUTED, MONO, spacing="0.8")
            self._text(x + 16, yy + 10, label, 9, INK, SANS, weight="bold")
            yy += 30
        self.y = yy + 2
        return self

    def journey(self, steps, reached):
        """The six-step JourneyBar from components/record-spine.tsx."""
        x = self.pad + 14
        for i, step in enumerate(steps):
            w = len(step) * 4.4 + 22
            if i < reached:
                bg, fg, st = SEAL_SOFT, SEAL_DEEP, SEAL
                mark = "OK"
            elif i == reached:
                bg, fg, st = OCHRE_SOFT, OCHRE, OCHRE
                mark = str(i + 1)
            else:
                bg, fg, st = WHITE, MUTED, LINE
                mark = str(i + 1)
            self._rect(x, self.y, w, 16, bg, st, rx=8)
            self._text(x + w / 2, self.y + 11.5, f"{mark} {step}".upper(), 6, fg,
                       MONO, anchor="middle", spacing="0.5")
            x += w + 4
        self.y += 24
        return self

    def seal(self, label, sub=None, x=None):
        """The perforated ochre verification stamp."""
        cx = (self.w / 2) if x is None else x
        cy = self.y + 32
        self.parts.append(
            f'<circle cx="{cx}" cy="{cy}" r="30" fill="{OCHRE_SOFT}" '
            f'stroke="{OCHRE}" stroke-width="1.6" stroke-dasharray="3 3"/>')
        self._text(cx, cy - 10, "ODIBRICK", 5.5, OCHRE, MONO, anchor="middle",
                   spacing="1.2")
        self._text(cx, cy + 3, label, 9.5, OCHRE, SANS, anchor="middle", weight="bold")
        if sub:
            self._text(cx, cy + 15, sub, 5.5, OCHRE, MONO, anchor="middle", spacing="0.6")
        self.y += 70
        return self

    def sidebar_page(self, nav_items, active, body_fn):
        """Two-column dashboard layout: nav rail plus a body region."""
        nav_w = 108
        start_y = self.y
        yy = self.y + 8
        for section, items in nav_items:
            self._text(self.pad + 10, yy, section.upper(), 6, MUTED, MONO, spacing="1.2")
            yy += 13
            for item in items:
                if item == active:
                    self._rect(self.pad + 6, yy - 9, nav_w - 12, 16, SEAL_SOFT, rx=3)
                    self._text(self.pad + 12, yy + 2, item, 8, SEAL_DEEP,
                               SANS, weight="bold")
                else:
                    self._text(self.pad + 12, yy + 2, item, 8, MUTED)
                yy += 17
            yy += 6
        inner = Screen(width=self.w - nav_w, pad=0, bg=None)
        body_fn(inner)
        self.parts.append(
            f'<g transform="translate({nav_w},{start_y})">{"".join(inner.parts)}</g>')
        self.y = max(yy, start_y + inner.y) + 6
        return self

    def photo(self, label, h=54, w=None):
        x = self.pad + 14
        w = w or (self.w - 28 - self.pad * 2)
        self._rect(x, self.y, w, h, SEAL_SOFT, LINE)
        self._text(x + w / 2, self.y + h / 2 + 3, label.upper(), 7, "#7FA396",
                   MONO, anchor="middle", spacing="1.6")
        self.y += h + 10
        return self

    def callout(self, text, tone="ochre"):
        x = self.pad + 14
        w = self.w - 28 - self.pad * 2
        bg, st, fg = (OCHRE_SOFT, OCHRE, INK) if tone == "ochre" else (PAPER, LINE, MUTED)
        if tone == "alert":
            bg, st, fg = "#F8EFED", ALERT, ALERT
        self._rect(x, self.y, w, 26, bg, st)
        self._text(x + 10, self.y + 17, text, 8.5, fg)
        self.y += 34
        return self

    def render(self, caption=None):
        """Emit at PRINT_W so the graphic fills the A4 text column.

        The design is authored at self.w (660) and scaled up via viewBox, so
        strokes and type scale together rather than the layout stretching.
        """
        h = int(self.y + 8)
        body = ""
        if self.bg:
            body += (f'<rect x="0" y="0" width="{self.w}" height="{h}" '
                     f'fill="{self.bg}"/>')
        body += "".join(self.parts)
        body += (f'<rect x="0.5" y="0.5" width="{self.w - 1}" height="{h - 1}" '
                 f'fill="none" stroke="{LINE}"/>')
        out_h = int(h * PRINT_W / self.w)
        svg = (f'<svg width="{PRINT_W}" height="{out_h}" '
               f'viewBox="0 0 {self.w} {h}" preserveAspectRatio="xMidYMin meet" '
               f'xmlns="http://www.w3.org/2000/svg">{body}</svg>')
        if caption:
            return (f'<figure class="mock"><div class="mockframe">{svg}</div>'
                    f'<figcaption>{esc(caption)}</figcaption></figure>')
        return f'<div class="mockframe">{svg}</div>'


# Shared navigation definitions, from apps/web/app/dashboard/dashboard-nav.tsx
NAV_TENANT = [
    ("Overview", ["What needs doing", "Notifications"]),
    ("Renting", ["Applications", "Tenancies", "Payments", "Maintenance"]),
    ("Account", ["Identity", "Documents", "Support"]),
]

NAV_OWNER = [
    ("Overview", ["What needs doing", "Notifications"]),
    ("Renting", ["Applications", "Tenancies", "Payments", "Maintenance"]),
    ("Listing", ["My properties", "Leads", "Marketing"]),
    ("Account", ["Identity", "Documents", "Support"]),
]

NAV_LEGAL = [
    ("Overview", ["What needs doing", "Notifications"]),
    ("Odibrick team", ["Legal queue", "Consultations"]),
    ("Account", ["Identity", "Documents"]),
]

NAV_KYC = [
    ("Overview", ["What needs doing"]),
    ("Odibrick team", ["Verification queue", "Identity queue"]),
]

NAV_ADMIN = [
    ("Overview", ["What needs doing"]),
    ("Odibrick team", ["Legal queue", "Verification queue",
                       "Campaign board", "Control centre"]),
]
