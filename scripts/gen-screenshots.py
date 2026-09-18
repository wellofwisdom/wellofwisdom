#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Generate placeholder-but-useful screenshots for launch.
# They are real product mockups at 1200x720 so they render sharp at 760 width,
# and small enough to keep the repo light. Replace with live captures when ready.
# Run: python scripts/gen-screenshots.py  (needs Pillow, already installed)

import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "web", "public")

# Palette from the site
BG_NIGHT = (11, 26, 42)
BG_CREAM = (249, 246, 238)
TEAL = (45, 150, 140)
TEAL_DARK = (32, 110, 102)
INK = (18, 28, 40)
MUTED = (110, 120, 135)
AMBER = (220, 165, 55)
WHITE = (255, 255, 255)
CARD_BG = (255, 255, 255)
BORDER = (228, 232, 238)

W, H = 1200, 720

def rounded_rect(draw, xy, r, fill, outline=None, width=1):
    # simple rounded rectangle via PIL's rounded_rectangle (Pillow >=8)
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=width)

def title_font(size):
    # Use default unless arial available
    for p in ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except:
                pass
    return ImageFont.load_default()

def bold_font(size):
    for p in ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/segoeuib.ttf"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except:
                pass
    return title_font(size)

def draw_header(draw, subtitle, title):
    # top bar
    draw.rectangle([0, 0, W, 56], fill=WHITE, outline=BORDER)
    # logo dot
    draw.ellipse([18, 14, 42, 38], fill=TEAL)
    draw.text((50, 16), "WELL OF WISDOM", fill=INK, font=bold_font(13))
    draw.text((W-200, 18), subtitle, fill=MUTED, font=title_font(12))

def shot_world():
    im = Image.new("RGB", (W, H), BG_CREAM)
    d = ImageDraw.Draw(im)
    # Header
    draw_header(d, "Demo family  -  Maya (learner)", "World Map")
    # Left panel: path nodes
    # Big title
    d.text((32, 74), "The world map", fill=INK, font=bold_font(28))
    d.text((32, 108), "Walk the course, beat the bosses, collect the lore.", fill=MUTED, font=title_font(13))
    # Map area
    map_y, map_h = 148, 420
    rounded_rect(d, [28, map_y, W-28, map_y+map_h], 18, fill=WHITE, outline=BORDER)
    # Path line
    d.line([(120, map_y+60), (300, map_y+140), (500, map_y+120), (720, map_y+200), (900, map_y+160), (1050, map_y+260)], fill=TEAL, width=6, joint="curve")
    # Nodes
    nodes = [
        (120, map_y+60, "1", "Fractions", TEAL, True),
        (300, map_y+140, "2", "Sewing", TEAL, True),
        (500, map_y+120, "3", "Boss: Fabric", AMBER, False),
        (720, map_y+200, "4", "Review", WHITE, False),
        (900, map_y+160, "5", "Pattern", MUTED, False),
        (1050, map_y+260, "6", "Boss: Quilt", AMBER, False),
    ]
    for x, y, n, label, fill, done in nodes:
        # node circle
        shadow = (0,0,0,20)
        d.ellipse([x-28, y-28, x+28, y+28], fill=fill, outline=TEAL if not done else TEAL_DARK, width=2)
        if fill == TEAL:
            d.text((x-6, y-10), n, fill=WHITE, font=bold_font(16))
        elif fill == AMBER:
            d.text((x-4, y-10), "!", fill=INK, font=bold_font(18))
        else:
            d.text((x-6, y-10), n, fill=INK, font=bold_font(16))
        # check for done
        if done:
            d.ellipse([x+16, y-20, x+32, y-4], fill=TEAL_DARK)
            d.text((x+20, y-18), "OK", fill=WHITE, font=title_font(7))
        d.text((x-30, y+34), label, fill=INK, font=title_font(11))
        if "Boss" in label:
            d.text((x-18, y+48), "boss", fill=AMBER, font=bold_font(9))
        if "Review" in label:
            d.text((x-16, y+48), "due now", fill=TEAL_DARK, font=bold_font(9))

    # Due strip
    rounded_rect(d, [28, map_y+map_h+16, 380, map_y+map_h+84], 12, fill=(255,248,225), outline=(240,210,140))
    d.text((48, map_y+map_h+28), "Practice due now  -  3 items", fill=INK, font=bold_font(13))
    d.text((48, map_y+map_h+48), "Review before you forget", fill=MUTED, font=title_font(11))
    # HUD bottom
    rounded_rect(d, [400, map_y+map_h+16, W-28, map_y+map_h+84], 12, fill=(14,32,50), outline=None)
    d.text((424, map_y+map_h+28), "Streak  12 days  |  Stamina  80  |  Level 4", fill=(180,210,215), font=title_font(12))
    d.text((424, map_y+map_h+48), "Maya  -  walking to Lesson 3", fill=WHITE, font=title_font(11))
    # caption footer
    d.text((32, H-26), "Learner home: the world map with the trail, due review and boss nodes visible. 1440 x 900 in the app.", fill=MUTED, font=title_font(10))
    p = os.path.join(OUT, "shot-world-map.png")
    im.save(p, "PNG", optimize=True)
    print(f"Wrote {p} ({os.path.getsize(p)} bytes)")

def shot_studio():
    im = Image.new("RGB", (W, H), BG_CREAM)
    d = ImageDraw.Draw(im)
    draw_header(d, "Guide  -  Course Studio", "Studio")
    # Title row with lens pill
    d.text((32, 74), "Fractions through Sewing", fill=INK, font=bold_font(26))
    d.text((32, 108), "Grade 4  -  3 units, 9 lessons  -  Draft, not yet published", fill=MUTED, font=title_font(12))
    rounded_rect(d, [W-220, 78, W-32, 108], 20, fill=TEAL, outline=None)
    d.text((W-190, 84), "Lens: Sewing", fill=WHITE, font=bold_font(12))
    # Three columns: units, lessons, items
    col_y, col_h = 140, 500
    # Units column
    rounded_rect(d, [28, col_y, 260, col_y+col_h], 14, fill=WHITE, outline=BORDER)
    d.text((44, col_y+14), "UNITS", fill=MUTED, font=bold_font(10))
    units = [("Unit 1: Cutting", True), ("Unit 2: Measuring", False), ("Unit 3: Pattern", False)]
    for i, (name, active) in enumerate(units):
        y = col_y + 38 + i*52
        if active:
            rounded_rect(d, [40, y, 248, y+40], 10, fill=(232, 245, 243), outline=TEAL)
        else:
            rounded_rect(d, [40, y, 248, y+40], 10, fill=(248,248,248), outline=BORDER)
        d.text((52, y+12), name, fill=INK if active else MUTED, font=bold_font(11) if active else title_font(11))
        d.text((52, y+26), f"{3 if active else 3} lessons", fill=MUTED, font=title_font(9))
    # Lessons column
    rounded_rect(d, [276, col_y, 520, col_y+col_h], 14, fill=WHITE, outline=BORDER)
    d.text((292, col_y+14), "LESSONS IN UNIT 1", fill=MUTED, font=bold_font(10))
    lessons = [("1. What is a fraction", True), ("2. Half and quarter", False), ("3. Cutting on the line", False)]
    for i, (name, active) in enumerate(lessons):
        y = col_y + 38 + i*52
        if active:
            rounded_rect(d, [288, y, 508, y+40], 10, fill=(232, 245, 243), outline=TEAL)
        else:
            rounded_rect(d, [288, y, 508, y+40], 10, fill=(248,248,248), outline=BORDER)
        d.text((300, y+12), name, fill=INK if active else MUTED, font=bold_font(11) if active else title_font(11))
        d.text((300, y+26), f"{4 if active else 3} items", fill=MUTED, font=title_font(9))
    # Items column (lesson detail)
    rounded_rect(d, [536, col_y, W-28, col_y+col_h], 14, fill=WHITE, outline=BORDER)
    d.text((552, col_y+14), "LESSON 1 ITEMS", fill=MUTED, font=bold_font(10))
    # Article card
    rounded_rect(d, [552, col_y+38, W-44, col_y+110], 10, fill=(253,253,253), outline=BORDER)
    d.text((564, col_y+46), "Article  -  Fractions are shares", fill=TEAL_DARK, font=bold_font(10))
    d.text((564, col_y+62), "A quilt square cut in four. Each piece", fill=INK, font=title_font(10))
    d.text((564, col_y+76), "is one quarter. Two pieces make a half.", fill=INK, font=title_font(10))
    # Exercise card
    rounded_rect(d, [552, col_y+122, W-44, col_y+210], 10, fill=(253,253,253), outline=BORDER)
    d.text((564, col_y+130), "Exercise (mcq)  -  graded", fill=TEAL_DARK, font=bold_font(10))
    d.text((564, col_y+146), "If you cut a strip in 8 and use 5, how", fill=INK, font=title_font(10))
    d.text((564, col_y+160), "much is left?  A) 3/8  B) 5/8", fill=INK, font=title_font(10))
    rounded_rect(d, [564, col_y+178, 620, col_y+198], 6, fill=(232,245,243), outline=TEAL)
    d.text((572, col_y+182), "Answer: A", fill=TEAL_DARK, font=bold_font(9))
    # Project card
    rounded_rect(d, [552, col_y+222, W-44, col_y+290], 10, fill=(253,253,253), outline=BORDER)
    d.text((564, col_y+230), "Project  -  Sew a fraction flag", fill=TEAL_DARK, font=bold_font(10))
    d.text((564, col_y+246), "Cut felt into quarters and halves, glue", fill=INK, font=title_font(10))
    d.text((564, col_y+260), "a flag, photograph it.", fill=INK, font=title_font(10))
    # Video row
    rounded_rect(d, [552, col_y+302, W-44, col_y+350], 10, fill=(248,248,248), outline=BORDER)
    d.text((564, col_y+314), "Video with questions  -  2 questions", fill=MUTED, font=bold_font(10))
    d.text((564, col_y+330), "YouTube: How fabric is woven (4:12)", fill=MUTED, font=title_font(10))
    # bottom note
    d.rectangle([536, col_y+380, W-28, col_y+410], fill=(255,248,225), outline=None)
    d.text((552, col_y+388), "AI draft  -  review and edit every word before learners see it.", fill=INK, font=title_font(10))
    d.text((32, H-26), "Course Studio: units and lessons on the left, items on the right, lens in the header.", fill=MUTED, font=title_font(10))
    p = os.path.join(OUT, "shot-studio.png")
    im.save(p, "PNG", optimize=True)
    print(f"Wrote {p} ({os.path.getsize(p)} bytes)")

def shot_report():
    im = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(im)
    draw_header(d, "Print preview", "Quarterly Report")
    # Page shadow container
    # Paper
    page_x0, page_x1 = 120, W-120
    page_y0, page_y1 = 80, H-40
    # shadow
    d.rectangle([page_x0+6, page_y0+6, page_x1+6, page_y1+6], fill=(230,230,230))
    d.rectangle([page_x0, page_y0, page_x1, page_y1], fill=WHITE, outline=(200,200,200))
    # Report header
    d.text((page_x0+32, page_y0+18), "Well of Wisdom  -  Quarterly Report", fill=MUTED, font=title_font(9))
    d.text((page_x0+32, page_y0+34), "Maya Alvarez  -  Age 9, Grade 4  -  Spring 2026", fill=INK, font=bold_font(14))
    d.text((page_x0+32, page_y0+56), "Family: Alvarez  -  Guide: Sofia Alvarez", fill=MUTED, font=title_font(10))
    d.line([(page_x0+32, page_y0+76), (page_x1-32, page_y0+76)], fill=BORDER, width=1)
    # Stats row
    stats = [("9", "lessons"), ("87%", "accuracy"), ("24", "active days"), ("3", "courses")]
    sx = page_x0 + 32
    for val, label in stats:
        d.text((sx, page_y0+86), val, fill=TEAL_DARK, font=bold_font(20))
        d.text((sx, page_y0+110), label, fill=MUTED, font=title_font(10))
        sx += 90
    # Per-course breakdown
    d.text((page_x0+32, page_y0+140), "Per course", fill=INK, font=bold_font(11))
    courses = [("Fractions through Sewing", "6/6 lessons, 92%"), ("Bugs and Birds", "2/4 lessons, 78%"), ("Intro to Python", "1/3 lessons, 85%")]
    y = page_y0 + 160
    for name, stat in courses:
        rounded_rect(d, [page_x0+32, y, page_x1-32, y+36], 8, fill=(249,246,238), outline=BORDER)
        d.text((page_x0+48, y+10), name, fill=INK, font=title_font(11))
        d.text((page_x1-140, y+12), stat, fill=MUTED, font=title_font(10))
        y += 44
    # Narrative box
    y += 8
    rounded_rect(d, [page_x0+32, y, page_x1-32, y+120], 10, fill=(248,253,252), outline=(200,230,225))
    d.text((page_x0+48, y+12), "Narrative (AI draft, edited by guide)", fill=TEAL_DARK, font=bold_font(10))
    d.text((page_x0+48, y+30), "Maya showed strong growth in fractions, moving from halves to", fill=INK, font=title_font(10))
    d.text((page_x0+48, y+46), "eighths through her sewing projects. Her review queue is clear.", fill=INK, font=title_font(10))
    d.text((page_x0+48, y+62), "Attendance: 24 active days from real work. Portfolio and work", fill=INK, font=title_font(10))
    d.text((page_x0+48, y+78), "samples attached. Guide notes: proud of her quilt flag.", fill=INK, font=title_font(10))
    d.text((page_x0+48, y+96), "You can edit this narrative before printing.", fill=MUTED, font=title_font(9))
    # Signature lines
    sig_y = y + 150
    d.line([(page_x0+32, sig_y), (page_x0+280, sig_y)], fill=INK, width=1)
    d.line([(page_x1-280, sig_y), (page_x1-32, sig_y)], fill=INK, width=1)
    d.text((page_x0+32, sig_y+6), "Guide signature", fill=MUTED, font=title_font(9))
    d.text((page_x0+32, sig_y+18), "Sofia Alvarez", fill=INK, font=title_font(9))
    d.text((page_x1-220, sig_y+6), "Date", fill=MUTED, font=title_font(9))
    d.text((page_x1-100, sig_y+18), "2026-09-18", fill=INK, font=title_font(9))
    # footer caption outside page
    d2 = ImageDraw.Draw(im)
    # put caption below the paper
    p = os.path.join(OUT, "shot-report.png")
    im.save(p, "PNG", optimize=True)
    print(f"Wrote {p} ({os.path.getsize(p)} bytes)")

def shot_og():
    # 1200x630 per spec for og.png (Social preview)
    W2, H2 = 1200, 630
    im = Image.new("RGB", (W2, H2), BG_NIGHT)
    d = ImageDraw.Draw(im)
    # subtle grid
    for x in range(0, W2, 80):
        d.line([(x, 0), (x, H2)], fill=(18, 38, 60), width=1)
    for y in range(0, H2, 80):
        d.line([(0, y), (W2, y)], fill=(18, 38, 60), width=1)
    # left copy
    d.text((48, 48), "WELL OF WISDOM", fill=(140, 170, 190), font=bold_font(14))
    d.text((48, 90), "Every learner", fill=WHITE, font=bold_font(54))
    d.text((48, 150), "drinks from their", fill=WHITE, font=bold_font(54))
    d.text((48, 210), "own well.", fill=(120, 220, 200), font=bold_font(54))
    d.text((48, 290), "Courses shaped around what they love, played as a world.", fill=(180, 205, 220), font=title_font(15))
    d.text((48, 314), "Review and records built in. Your server, your data.", fill=(180, 205, 220), font=title_font(15))
    # CTA pills
    rounded_rect(d, [48, 360, 220, 400], 20, fill=TEAL)
    d.text((72, 370), "Try the demo", fill=WHITE, font=bold_font(13))
    rounded_rect(d, [236, 360, 420, 400], 20, fill=WHITE, outline=None)
    d.text((260, 370), "Self-host free", fill=INK, font=bold_font(13))
    d.text((48, 420), "Open source  -  AGPL-3.0  -  No ads  -  No trackers", fill=(120, 150, 170), font=title_font(11))
    # right: mini world card
    card_x0, card_x1 = 680, 1152
    card_y0, card_y1 = 80, 550
    rounded_rect(d, [card_x0, card_y0, card_x1, card_y1], 18, fill=WHITE)
    d.text((card_x0+24, card_y0+18), "Learner path", fill=MUTED, font=bold_font(10))
    d.text((card_x0+24, card_y0+40), "Fractions through Sewing", fill=INK, font=bold_font(16))
    # mini trail
    trail_y = card_y0 + 90
    d.line([(card_x0+40, trail_y), (card_x0+120, trail_y+40), (card_x0+200, trail_y+20), (card_x0+280, trail_y+60)], fill=TEAL, width=4)
    for cx, cy, label in [(card_x0+40, trail_y, "1"), (card_x0+120, trail_y+40, "2"), (card_x0+200, trail_y+20, "3"), (card_x0+280, trail_y+60, "Boss")]:
        col = AMBER if label == "Boss" else TEAL
        d.ellipse([cx-18, cy-18, cx+18, cy+18], fill=col)
        d.text((cx-8 if label!="Boss" else cx-14, cy-8), label if label!="Boss" else "!", fill=WHITE if label!="Boss" else INK, font=bold_font(10) if label!="Boss" else bold_font(14))
    # items preview
    iy = card_y0 + 190
    for t in ["Article: Fractions are shares", "Exercise: 5/8 of a strip", "Project: Sew a flag"]:
        rounded_rect(d, [card_x0+24, iy, card_x1-24, iy+42], 10, fill=(248,246,240), outline=BORDER)
        d.text((card_x0+36, iy+12), t, fill=INK, font=title_font(11))
        iy += 52
    # bottom bar
    rounded_rect(d, [card_x0+24, card_y1-56, card_x1-24, card_y1-20], 10, fill=(11,26,42))
    d.text((card_x0+36, card_y1-48), "Streak 12  |  Stamina 80  |  Level 4", fill=(180,210,215), font=title_font(10))
    p = os.path.join(OUT, "og.png")
    im.save(p, "PNG", optimize=True)
    print(f"Wrote {p} ({os.path.getsize(p)} bytes)")

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    shot_world()
    shot_studio()
    shot_report()
    shot_og()
    print("Done.")
