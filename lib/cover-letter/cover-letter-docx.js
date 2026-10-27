import {
  AlignmentType,
  convertMillimetersToTwip,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const FONT = "Arial";
const PT = (n) => Math.round(n * 2);

const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MARGIN_MM = 25;

function safeStr(v) {
  if (v == null) return "";
  return String(v);
}

/**
 * @param {{ name: string, email?: string, phone?: string, location?: string, linkedin?: string, paragraphs: string[] }} data
 */
export async function buildCoverLetterDocxBuffer(data) {
  const children = [];
  const name = safeStr(data.name).trim();
  if (name) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: name,
            bold: true,
            font: FONT,
            size: PT(14),
          }),
        ],
      })
    );
  }

  const contactBits = [];
  if (data.email) contactBits.push(safeStr(data.email));
  if (data.phone) contactBits.push(safeStr(data.phone));
  if (data.location) contactBits.push(safeStr(data.location));
  if (data.linkedin) contactBits.push(safeStr(data.linkedin));
  if (contactBits.length) {
    children.push(
      new Paragraph({
        spacing: { after: 280 },
        children: [
          new TextRun({
            text: contactBits.join(" · "),
            font: FONT,
            size: PT(10),
          }),
        ],
      })
    );
  } else {
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
  for (const p of paragraphs) {
    const text = safeStr(p).trim();
    if (!text) continue;
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200, line: 276 },
        children: [
          new TextRun({
            text,
            font: FONT,
            size: PT(11),
          }),
        ],
      })
    );
  }

  const marginTwip = convertMillimetersToTwip(MARGIN_MM);
  const doc = new Document({
    title: "Cover letter",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(PAGE_W_MM),
              height: convertMillimetersToTwip(PAGE_H_MM),
            },
            margin: {
              top: marginTwip,
              right: marginTwip,
              bottom: marginTwip,
              left: marginTwip,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
