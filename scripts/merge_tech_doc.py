"""Merge tech doc cover + body PDF and add metadata."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
        page.scale_to(A4_W, A4_H)
    return page

COVER = "/home/z/my-project/scripts/tech_doc_cover.pdf"
BODY = "/home/z/my-project/scripts/tech_doc_body.pdf"
OUTPUT = "/home/z/my-project/download/01_FinWise_Technical_Documentation.pdf"

writer = PdfWriter()
writer.add_page(normalize_page_to_a4(PdfReader(COVER).pages[0]))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))

writer.add_metadata({
    '/Title': 'FinWise Technical Documentation',
    '/Author': 'FinWise Team',
    '/Creator': 'Z.ai',
    '/Subject': 'PBCSF International Track Topic A — Technical Documentation',
    '/Keywords': 'AI Agent, Personal Finance, Agentic AI, PBCSF, WeBank, Topic A',
})

with open(OUTPUT, 'wb') as f:
    writer.write(f)

print(f"Merged PDF: {OUTPUT}")
print(f"Total pages: {len(writer.pages)}")
