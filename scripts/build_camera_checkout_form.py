from pathlib import Path

from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.acroform import AcroForm
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "resources" / "photography" / "digital-corps-camera-lens-checkout-agreement.pdf"
LOGO = ROOT / "public" / "brand" / "digital-corps-logo.png"

PAGE_W, PAGE_H = letter
MARGIN = 36
CONTENT_W = PAGE_W - 2 * MARGIN

DC_GREEN = HexColor("#00594F")
DC_TEAL = HexColor("#8FB3B0")
DARK = HexColor("#202428")
MID = HexColor("#657079")
LIGHT = HexColor("#DDE3E5")
PALE = HexColor("#F4F7F7")
FIELD_FILL = HexColor("#FFFDF5")


def draw_wrapped(c, text, x, y, width, font="Helvetica", size=9, leading=11, color=DARK):
    c.setFont(font, size)
    c.setFillColor(color)
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if c.stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_section(c, title, y):
    c.setFillColor(DC_GREEN)
    c.roundRect(MARGIN, y - 18, CONTENT_W, 22, 3, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(MARGIN + 8, y - 12, title)
    return y - 28


def field(c, name, label, x, y, w, h=20, value="", multiline=False, font_size=9):
    c.setFillColor(MID)
    c.setFont("Helvetica-Bold", 7.4)
    c.drawString(x, y + h + 3, label)
    flags = 4096 if multiline else 0
    c.acroForm.textfield(
        name=name,
        value=value,
        x=x,
        y=y,
        width=w,
        height=h,
        borderStyle="solid",
        borderWidth=0.7,
        borderColor=DC_TEAL,
        fillColor=FIELD_FILL,
        textColor=DARK,
        forceBorder=True,
        fontName="Helvetica",
        fontSize=font_size,
        fieldFlags=flags,
    )


def cell_field(c, name, x, y, w, h, font_size=7.5):
    c.acroForm.textfield(
        name=name,
        x=x + 2,
        y=y + 2,
        width=w - 4,
        height=h - 4,
        borderStyle="solid",
        borderWidth=0,
        fillColor=FIELD_FILL,
        textColor=DARK,
        forceBorder=False,
        fontName="Helvetica",
        fontSize=font_size,
        fieldFlags=0,
    )


def checkbox(c, name, label, x, y, checked=False):
    c.acroForm.checkbox(
        name=name,
        x=x,
        y=y,
        size=11,
        checked=checked,
        buttonStyle="check",
        borderWidth=0.8,
        borderColor=DC_GREEN,
        fillColor=white,
        textColor=DC_GREEN,
        forceBorder=True,
    )
    c.setFillColor(DARK)
    c.setFont("Helvetica", 8.5)
    c.drawString(x + 15, y + 1.5, label)


def draw_page_header(c, page_num, full=False):
    if full:
        if LOGO.exists():
            c.drawImage(ImageReader(str(LOGO)), PAGE_W - MARGIN - 54, PAGE_H - 87, width=47, height=54, mask="auto", preserveAspectRatio=True)
        c.setFillColor(DC_GREEN)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(MARGIN, PAGE_H - 48, "Digital Corps Camera and Lens")
        c.drawString(MARGIN, PAGE_H - 70, "Checkout Agreement")
        c.setFillColor(MID)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(MARGIN, PAGE_H - 87, "BEMIDJI STATE UNIVERSITY  |  SCHOOL OF TECHNOLOGY ART AND DESIGN")
        c.setStrokeColor(DC_TEAL)
        c.setLineWidth(1)
        c.line(MARGIN, PAGE_H - 95, PAGE_W - MARGIN, PAGE_H - 95)
    else:
        c.setFillColor(DC_GREEN)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(MARGIN, PAGE_H - 36, "Digital Corps Camera and Lens Checkout Agreement")
        c.setStrokeColor(DC_TEAL)
        c.setLineWidth(0.8)
        c.line(MARGIN, PAGE_H - 44, PAGE_W - MARGIN, PAGE_H - 44)

    c.setFillColor(MID)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(PAGE_W / 2, 20, f"Digital Corps equipment checkout  |  Page {page_num} of 2")


def numbered_rule(c, number, heading, body, y):
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 8.6)
    lead = f"{number}. {heading}."
    c.drawString(MARGIN, y, lead)
    body_x = MARGIN + c.stringWidth(lead + " ", "Helvetica-Bold", 8.6)
    first_line_width = PAGE_W - MARGIN - body_x
    words = body.split()
    first = ""
    rest = []
    for idx, word in enumerate(words):
        candidate = f"{first} {word}".strip()
        if c.stringWidth(candidate, "Helvetica", 8.6) <= first_line_width:
            first = candidate
        else:
            rest = words[idx:]
            break
    c.setFont("Helvetica", 8.6)
    if first:
        c.drawString(body_x, y, first)
    y -= 10.5
    if rest:
        y = draw_wrapped(c, " ".join(rest), MARGIN + 12, y, CONTENT_W - 12, size=8.6, leading=10.5)
    return y - 4


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=letter)
    c.setTitle("Digital Corps Camera and Lens Checkout Agreement")
    c.setAuthor("Digital Corps at Bemidji State University")
    c.setSubject("Fillable agreement for Digital Corps camera and lens checkout")

    # Page 1
    draw_page_header(c, 1, full=True)
    y = PAGE_H - 113
    y = draw_wrapped(
        c,
        "Use this form whenever a Digital Corps worker takes university-owned camera equipment outside its normal storage area. The worker and approving supervisor should inspect the items at checkout and return and document their condition.",
        MARGIN,
        y,
        CONTENT_W,
        size=8.8,
        leading=10.8,
    ) - 3

    y = draw_section(c, "Worker and Checkout Information", y)
    row_y = y - 20
    field(c, "worker_name", "Digital Corps worker name", MARGIN, row_y, 270)
    field(c, "bsu_email", "BSU email", MARGIN + 282, row_y, 258)
    row_y -= 43
    field(c, "starid", "StarID", MARGIN, row_y, 115)
    field(c, "worker_role", "Role or pathway", MARGIN + 127, row_y, 182)
    field(c, "phone", "Phone", MARGIN + 321, row_y, 219)
    row_y -= 43
    field(c, "project_client", "Project or client", MARGIN, row_y, 260)
    field(c, "supervisor_director", "Approving mentor director or supervisor", MARGIN + 272, row_y, 268)
    row_y -= 43
    field(c, "checkout_datetime", "Checkout date and time", MARGIN, row_y, 165)
    field(c, "return_due", "Return due date and time", MARGIN + 177, row_y, 165)
    field(c, "approved_use_location", "Approved use or location", MARGIN + 354, row_y, 186)

    y = row_y - 18
    y = draw_section(c, "Equipment Inventory", y)
    table_top = y
    col_widths = [92, 96, 82, 104, 96, 70]
    headers = ["Equipment", "Make and model", "Asset or serial", "Included items", "Condition out", "Replacement value"]
    header_h = 28
    row_h = 33
    x = MARGIN
    c.setLineWidth(0.6)
    for width, header in zip(col_widths, headers):
        c.setFillColor(DC_GREEN)
        c.setStrokeColor(LIGHT)
        c.rect(x, table_top - header_h, width, header_h, fill=1, stroke=1)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 6.7)
        words = header.split()
        if len(words) > 1:
            mid = (len(words) + 1) // 2
            line1 = " ".join(words[:mid])
            line2 = " ".join(words[mid:])
            c.drawCentredString(x + width / 2, table_top - 11, line1)
            c.drawCentredString(x + width / 2, table_top - 20, line2)
        else:
            c.drawCentredString(x + width / 2, table_top - 16, header)
        x += width

    row_labels = ["Camera body", "Primary lens", "Additional lens", "Battery charger media", "Bag and other items"]
    for row_idx, label in enumerate(row_labels, start=1):
        row_top = table_top - header_h - (row_idx - 1) * row_h
        row_bottom = row_top - row_h
        x = MARGIN
        for col_idx, width in enumerate(col_widths):
            c.setFillColor(PALE if row_idx % 2 == 0 else white)
            c.setStrokeColor(LIGHT)
            c.rect(x, row_bottom, width, row_h, fill=1, stroke=1)
            if col_idx == 0:
                c.setFillColor(DARK)
                c.setFont("Helvetica-Bold", 7.3)
                draw_wrapped(c, label, x + 4, row_top - 13, width - 8, font="Helvetica-Bold", size=7.3, leading=8.5)
            else:
                suffixes = ["model", "asset_serial", "included_items", "condition_out", "replacement_value"]
                cell_field(c, f"equipment_{row_idx}_{suffixes[col_idx - 1]}", x, row_bottom, width, row_h)
            x += width

    y = table_top - header_h - len(row_labels) * row_h - 18
    field(c, "condition_notes", "Condition notes and existing marks", MARGIN, y - 30, CONTENT_W, h=30, multiline=True, font_size=8)
    y -= 49
    y = draw_section(c, "Worker Responsibilities", y)

    rules_page_1 = [
        ("Approved use", "I will use the equipment only for the Digital Corps project or assignment listed above. I will not lend, transfer, or permit another person to use it without supervisor approval."),
        ("Careful handling", "I will follow supervisor and manufacturer guidance, keep caps on when equipment is not in use, and protect lens mounts, glass, sensors, controls, and connectors. I will not disassemble equipment or attempt repairs."),
        ("Transport", "I will turn the camera off, attach the appropriate caps, and transport the camera and lenses in the assigned padded bag. I will keep the bag secured and will not leave it unattended in public or visible inside a vehicle."),
    ]
    for idx, (heading, body) in enumerate(rules_page_1, start=1):
        y = numbered_rule(c, idx, heading, body, y)

    c.showPage()

    # Page 2
    draw_page_header(c, 2, full=False)
    y = PAGE_H - 64
    y = draw_section(c, "Worker Responsibilities Continued", y)
    rules_page_2 = [
        ("Storage", "I will store the equipment indoors in a dry, secure, temperature-stable location. I will not leave it overnight in a vehicle or expose it to moisture, sand, smoke, food, pets, extreme heat, or extreme cold."),
        ("Weather and unsafe conditions", "I will use suitable protection and stop using the equipment if rain, snow, condensation, impact risk, or another hazard could damage it."),
        ("Inspection and existing problems", "I will inspect every item before leaving and report any missing part, damage, or malfunction immediately. I will stop using equipment that appears unsafe or is not working correctly."),
        ("Loss damage theft or malfunction", "I will contact a Digital Corps director or authorized supervisor promptly, provide an accurate description, and cooperate with University reporting. I will not conceal damage or arrange a repair myself."),
        ("Return", "I will return every listed item and accessory by the due date in the condition recorded at checkout, except for normal wear. Return is complete only after authorized staff confirms all items are present and inspects them."),
        ("Financial responsibility", "I may be responsible for authorized repair or replacement costs when loss or damage results from negligence, misuse, unauthorized use, or failure to secure the equipment. Charges or holds, if any, will follow University and Minnesota State procedures."),
        ("Access and work assignments", "Missing equipment, overdue returns, unsafe use, or unresolved damage may suspend my equipment checkout privileges or related Digital Corps assignments until the matter is reviewed and resolved under applicable University policy."),
    ]
    for idx, (heading, body) in enumerate(rules_page_2, start=4):
        y = numbered_rule(c, idx, heading, body, y)

    y = draw_section(c, "Acknowledgment", y + 1)
    y = draw_wrapped(
        c,
        "I have reviewed the equipment and these terms, had an opportunity to ask questions, and agree to follow these requirements. This agreement supplements and does not replace applicable Bemidji State University and Minnesota State policies.",
        MARGIN,
        y,
        CONTENT_W,
        size=8.6,
        leading=10.5,
    ) - 10

    field(c, "worker_signature", "Worker signature or typed name", MARGIN, y - 20, 210)
    field(c, "worker_signature_date", "Date", MARGIN + 222, y - 20, 72)
    field(c, "supervisor_signature", "Approving supervisor signature or typed name", MARGIN + 306, y - 20, 162)
    field(c, "supervisor_signature_date", "Date", MARGIN + 480, y - 20, 60)

    y -= 59
    y = draw_section(c, "Return Inspection", y)
    row_y = y - 20
    field(c, "return_datetime", "Date and time returned", MARGIN, row_y, 220)
    field(c, "inspected_by", "Received and inspected by", MARGIN + 232, row_y, 308)
    row_y -= 35
    c.setFillColor(MID)
    c.setFont("Helvetica-Bold", 7.4)
    c.drawString(MARGIN, row_y + 14, "Inventory")
    checkbox(c, "inventory_complete", "Complete", MARGIN + 56, row_y + 7)
    checkbox(c, "inventory_missing", "Missing item", MARGIN + 142, row_y + 7)
    c.setFillColor(MID)
    c.setFont("Helvetica-Bold", 7.4)
    c.drawString(MARGIN + 278, row_y + 14, "Condition")
    checkbox(c, "condition_same", "Same condition", MARGIN + 340, row_y + 7)
    checkbox(c, "condition_damage", "Damage noted", MARGIN + 452, row_y + 7)
    row_y -= 37
    field(c, "incident_reference", "Incident or work order reference", MARGIN, row_y, 270)
    c.setFillColor(MID)
    c.setFont("Helvetica-Bold", 7.4)
    c.drawString(MARGIN + 282, row_y + 23, "Follow-up required")
    checkbox(c, "followup_no", "No", MARGIN + 385, row_y + 12)
    checkbox(c, "followup_yes", "Yes", MARGIN + 445, row_y + 12)
    row_y -= 50
    field(c, "return_notes", "Return notes", MARGIN, row_y, CONTENT_W, h=28, multiline=True, font_size=8)
    row_y -= 51
    field(c, "worker_initials", "Worker initials", MARGIN, row_y, 105)
    field(c, "worker_initials_date", "Date", MARGIN + 117, row_y, 70)
    field(c, "staff_initials", "Staff initials", MARGIN + 293, row_y, 105)
    field(c, "staff_initials_date", "Date", MARGIN + 410, row_y, 70)

    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
