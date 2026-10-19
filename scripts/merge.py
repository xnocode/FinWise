"""Merge cover PDF (page 1) with body PDF (pages 2+) and add metadata."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
        page.scale_to(A4_W, A4_H)
    return page

COVER = "/home/z/my-project/scripts/cover.pdf"
BODY = "/home/z/my-project/scripts/body.pdf"
OUTPUT = "/home/z/my-project/download/Topic_A_Personal_Finance_Assistant_Agent_Roadmap.pdf"

writer = PdfWriter()
cover_page = PdfReader(COVER).pages[0]
writer.add_page(normalize_page_to_a4(cover_page))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))

writer.add_metadata({
    '/Title': 'Personal Finance Assistant AI Agent Roadmap',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Roadmap for PBCSF International Track Topic A',
    '/Keywords': 'AI Agent, Personal Finance, Roadmap, PBCSF, WeBank, Topic A',
})

with open(OUTPUT, 'wb') as f:
    writer.write(f)

print(f"Merged PDF: {OUTPUT}")
print(f"Total pages: {len(writer.pages)}")
