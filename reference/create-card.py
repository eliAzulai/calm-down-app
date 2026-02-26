from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

def draw_rounded_rect(c, x, y, w, h, r, fill_color=None, stroke_color=None, stroke_width=1):
    c.saveState()
    if fill_color:
        c.setFillColor(fill_color)
    if stroke_color:
        c.setStrokeColor(stroke_color)
        c.setLineWidth(stroke_width)
    p = c.beginPath()
    p.roundRect(x, y, w, h, r)
    if fill_color and stroke_color:
        c.drawPath(p, fill=1, stroke=1)
    elif fill_color:
        c.drawPath(p, fill=1, stroke=0)
    else:
        c.drawPath(p, fill=0, stroke=1)
    c.restoreState()

def create_calm_card():
    filename = "/home/claude/calm_down_card.pdf"
    c = canvas.Canvas(filename, pagesize=letter)
    w, h = letter

    # Colors
    bg_dark = HexColor("#0d1b2a")
    bg_card = HexColor("#1b2d45")
    teal = HexColor("#48b5a0")
    teal_light = HexColor("#5cc8b3")
    teal_dark = HexColor("#3a9a88")
    text_light = HexColor("#c0d4e0")
    text_mid = HexColor("#8aa8b8")
    text_dim = HexColor("#5a7a8a")
    accent_red = HexColor("#d64550")
    accent_orange = HexColor("#e8a838")
    accent_blue = HexColor("#4a6fa5")
    accent_lblue = HexColor("#6b9ac4")
    white = HexColor("#ffffff")

    # ==================== PAGE 1: CALM DOWN CARD ====================
    # Background
    c.setFillColor(bg_dark)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Title area
    c.setFillColor(teal)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(w/2, h - 60, "CALM STATION")
    c.setFont("Helvetica", 11)
    c.setFillColor(text_dim)
    c.drawCentredString(w/2, h - 78, "Your Regulation Tool  •  Keep This Card Nearby")

    # Divider
    c.setStrokeColor(HexColor("#2a3a4a"))
    c.setLineWidth(1)
    c.line(60, h - 95, w - 60, h - 95)

    # === SECTION 1: ENERGY CHECK ===
    y_start = h - 125
    draw_rounded_rect(c, 40, y_start - 155, w - 80, 165, 12,
                      fill_color=HexColor("#152030"), stroke_color=HexColor("#2a3a4a"))

    c.setFillColor(teal)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(60, y_start, "1  CHECK YOUR ENERGY")

    levels = [
        ("OVERLOAD", "Can't think straight", accent_red),
        ("WIRED", "Restless or tense", accent_orange),
        ("CALM ZONE", "Ready to think", teal),
        ("LOW", "Tired or foggy", accent_lblue),
        ("SHUTDOWN", "Frozen or numb", accent_blue),
    ]

    y = y_start - 28
    for label, desc, color in levels:
        # Circle
        c.setFillColor(color)
        c.circle(75, y + 4, 6, fill=1, stroke=0)
        # Checkbox
        draw_rounded_rect(c, w - 95, y - 4, 18, 18, 3,
                         stroke_color=HexColor("#3a4a5a"), stroke_width=1)
        # Text
        c.setFillColor(text_light)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(92, y, label)
        c.setFillColor(text_dim)
        c.setFont("Helvetica", 10)
        c.drawString(92 + c.stringWidth(label + "  ", "Helvetica-Bold", 11), y, f"— {desc}")
        y -= 25

    # Arrow indicator
    c.setFillColor(teal_light)
    c.setFont("Helvetica", 9)
    c.drawCentredString(w/2, y_start - 150, "Circle where you are right now")

    # === SECTION 2: BREATHE ===
    y_start = h - 310
    draw_rounded_rect(c, 40, y_start - 140, w - 80, 150, 12,
                      fill_color=HexColor("#152030"), stroke_color=HexColor("#2a3a4a"))

    c.setFillColor(teal)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(60, y_start, "2  BREATHE")

    # Box breathing visual
    box_x = 75
    box_y = y_start - 100
    box_size = 90

    # Draw the box
    c.setStrokeColor(teal)
    c.setLineWidth(2)
    c.rect(box_x, box_y, box_size, box_size, fill=0, stroke=1)

    # Labels on each side
    c.setFillColor(teal_light)
    c.setFont("Helvetica-Bold", 10)

    # Top - IN 4
    c.drawCentredString(box_x + box_size/2, box_y + box_size + 8, "IN — 4 sec")
    # Right - HOLD 4
    c.saveState()
    c.translate(box_x + box_size + 15, box_y + box_size/2)
    c.rotate(90)
    c.drawCentredString(0, 0, "HOLD — 4 sec")
    c.restoreState()
    # Bottom - OUT 4
    c.drawCentredString(box_x + box_size/2, box_y - 16, "OUT — 4 sec")
    # Left - HOLD 4
    c.saveState()
    c.translate(box_x - 15, box_y + box_size/2)
    c.rotate(-90)
    c.drawCentredString(0, 0, "HOLD — 4 sec")
    c.restoreState()

    # Arrow indicators on box
    c.setStrokeColor(teal_light)
    c.setLineWidth(1.5)
    # Top arrow (right)
    c.line(box_x + 10, box_y + box_size, box_x + box_size - 10, box_y + box_size)
    # Right arrow (down)
    c.line(box_x + box_size, box_y + box_size - 10, box_x + box_size, box_y + 10)

    # Other patterns text
    text_x = box_x + box_size + 55
    c.setFillColor(text_mid)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(text_x, y_start - 22, "BOX BREATHING")
    c.setFont("Helvetica", 10)
    c.setFillColor(text_dim)
    c.drawString(text_x, y_start - 38, "Equal rhythm — steady and")
    c.drawString(text_x, y_start - 52, "predictable. Repeat 4 times.")

    c.setFillColor(text_mid)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(text_x, y_start - 78, "ALSO TRY:")
    c.setFont("Helvetica", 10)
    c.setFillColor(text_dim)
    c.drawString(text_x, y_start - 94, "4-7-8: In 4, Hold 7, Out 8")
    c.drawString(text_x, y_start - 108, "Simple: In 5, Out 5")

    # Do X cycles note
    c.setFillColor(teal)
    c.setFont("Helvetica", 9)
    c.drawCentredString(w/2, y_start - 132, "Do at least 4 full cycles before moving on")

    # === SECTION 3: GROUND (5-4-3-2-1) ===
    y_start = h - 485
    draw_rounded_rect(c, 40, y_start - 160, w - 80, 170, 12,
                      fill_color=HexColor("#152030"), stroke_color=HexColor("#2a3a4a"))

    c.setFillColor(teal)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(60, y_start, "3  GROUND YOURSELF")

    c.setFillColor(text_dim)
    c.setFont("Helvetica", 10)
    c.drawString(60, y_start - 18, "Use your senses to come back to the present moment")

    senses = [
        ("5", "SEE", "Name 5 things you can see"),
        ("4", "TOUCH", "Name 4 things you can feel"),
        ("3", "HEAR", "Name 3 things you can hear"),
        ("2", "SMELL", "Name 2 things you can smell"),
        ("1", "TASTE", "Name 1 thing you can taste"),
    ]

    y = y_start - 42
    for num, sense, prompt in senses:
        # Number circle
        c.setFillColor(teal)
        c.circle(78, y + 4, 12, fill=1, stroke=0)
        c.setFillColor(bg_dark)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(78, y, num)
        # Sense label
        c.setFillColor(text_light)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(100, y, sense)
        # Prompt
        c.setFillColor(text_dim)
        c.setFont("Helvetica", 10)
        c.drawString(155, y, prompt)
        # Checkboxes for counting
        cx = w - 100
        for i in range(int(num)):
            draw_rounded_rect(c, cx - (int(num) - 1 - i) * 20, y - 4, 14, 14, 2,
                             stroke_color=HexColor("#3a4a5a"), stroke_width=0.8)
        y -= 26

    # === SECTION 4: REFLECT ===
    y_start = h - 672
    draw_rounded_rect(c, 40, y_start - 80, w - 80, 90, 12,
                      fill_color=HexColor("#152030"), stroke_color=HexColor("#2a3a4a"))

    c.setFillColor(teal)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(60, y_start, "4  CHECK AGAIN")

    c.setFillColor(text_mid)
    c.setFont("Helvetica", 11)
    c.drawString(60, y_start - 22, "Where is your energy now?  Are you closer to the Calm Zone?")

    c.setFillColor(text_dim)
    c.setFont("Helvetica", 10)
    c.drawString(60, y_start - 44, "If yes  →  You're ready to think and solve problems.")
    c.drawString(60, y_start - 60, "If not  →  That's okay. Go through steps 2-3 again.")

    # Bottom quote
    draw_rounded_rect(c, 40, 40, w - 80, 50, 10,
                      fill_color=HexColor("#152a30"), stroke_color=HexColor("#2a4a4a"))

    c.setFillColor(teal_light)
    c.setFont("Helvetica-Oblique", 11)
    c.drawCentredString(w/2, 68, "A calm person can think.  A calm person can choose.")
    c.setFillColor(text_dim)
    c.setFont("Helvetica", 9)
    c.drawCentredString(w/2, 52, "That's where self-government begins.")

    c.showPage()
    c.save()
    return filename

if __name__ == "__main__":
    f = create_calm_card()
    print(f"Created: {f}")
