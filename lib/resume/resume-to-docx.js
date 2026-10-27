import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip,
  Document,
  ImageRun,
  LineRuleType,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";

function sanitizeFileNamePart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * @param {string} resumeName
 * @param {string|null|undefined} companyName
 * @param {string|null|undefined} [jobTitle]
 */
export function computeResumeBaseFileName(resumeName, companyName, jobTitle) {
  const nameParts = resumeName ? String(resumeName).trim().split(/\s+/) : [];
  let baseName;
  if (!nameParts || nameParts.length === 0) baseName = "resume";
  else if (nameParts.length === 1) baseName = nameParts[0];
  else baseName = `${nameParts[0]}_${nameParts[nameParts.length - 1]}`;
  baseName = sanitizeFileNamePart(baseName) || "resume";
  const company = sanitizeFileNamePart(companyName);
  if (company) baseName = `${baseName}_${company}`;
  const title = sanitizeFileNamePart(jobTitle);
  if (title) baseName = `${baseName}_${title}`;
  return baseName;
}

function safeStr(v) {
  if (v == null) return "";
  return String(v);
}

/** Arial: widely ATS-friendly, standard on recruiters’ systems (paired with PDF Helvetica). */
const FONT = "Arial";

/** Résumé page: A4 with ~1 cm margins (matches PDF density) */
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MARGIN_MM = 10;

const marginTwip = convertMillimetersToTwip(MARGIN_MM);
const pageWidthTwip = convertMillimetersToTwip(PAGE_W_MM);
/** Right-aligned tab at the text-area right edge (not `TabStopPosition.MAX`, which is far too narrow). */
const RIGHT_TAB_POS = pageWidthTwip - marginTwip;

/** docx `size` is half-points */
const PT = (n) => Math.round(n * 2);

/** Prefer soft breaks inside long URLs (slashes) without splitting the label from the URL */
function softBreakUrl(url) {
  const s = safeStr(url);
  return s.replace(/\//g, "/\u200b");
}

/** Map pin — same path as `PdfIconPin` in `lib/pdf-templates/PdfIcons.js` (black ink, not emoji). */
const LOCATION_PIN_SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000000" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;

/** LinkedIn wordmark (SVG for Word 2019+; 1×1 PNG fallback for older viewers) */
const LINKEDIN_SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`;

const TINY_PNG_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

/** Keep date ranges on one line in Word */
function singleLineDateRange(parts) {
  const p = parts.filter(Boolean).map(safeStr);
  if (p.length === 0) return "";
  if (p.length === 1) return p[0];
  return p.join("\u00a0–\u00a0");
}

const sectionRuleBorder = {
  bottom: {
    color: "000000",
    space: 1,
    style: BorderStyle.SINGLE,
    size: 6,
  },
};

function sectionHeading(text, { keepWithNext = false } = {}) {
  return new Paragraph({
    spacing: { before: 220, after: 96 },
    border: sectionRuleBorder,
    keepNext: keepWithNext,
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        font: FONT,
        size: PT(10.5),
      }),
    ],
  });
}

/**
 * Build a .docx buffer from the same `templateData` shape used for React-PDF templates.
 * Matches the classic PDF style: Arial/Helvetica, section rules, title line | dates, skills with markers.
 */
export async function buildResumeDocxBuffer(templateData) {
  const children = [];

  children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 96 },
        children: [
          new TextRun({
            text: safeStr(templateData.name),
            bold: true,
            font: FONT,
            size: PT(22),
          }),
        ],
      })
    );

  if (templateData.title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 132 },
        children: [
          new TextRun({
            text: safeStr(templateData.title),
            italics: true,
            font: FONT,
            size: PT(11),
          }),
        ],
      })
    );
  }

  /* Contact row: vector SVG icons (Buffer) for pin + LinkedIn — matches PDF artwork, not emoji fonts. */
  const gap = "   ";
  const contactRuns = [];
  let first = true;
  const pushGap = () => {
    if (!first) {
      contactRuns.push(
        new TextRun({ text: gap, font: FONT, size: PT(10) })
      );
    }
    first = false;
  };
  if (templateData.email) {
    pushGap();
    contactRuns.push(
      new TextRun({
        text: `\u2709 ${safeStr(templateData.email)}`,
        font: FONT,
        size: PT(10),
      })
    );
  }
  if (templateData.phone) {
    pushGap();
    contactRuns.push(
      new TextRun({
        text: `\u260e ${safeStr(templateData.phone)}`,
        font: FONT,
        size: PT(10),
      })
    );
  }
  if (templateData.location) {
    pushGap();
    contactRuns.push(
      new ImageRun({
        type: "svg",
        data: Buffer.from(LOCATION_PIN_SVG_MARKUP, "utf8"),
        transformation: { width: 12, height: 12 },
        fallback: {
          type: "png",
          data: TINY_PNG_PIXEL,
          transformation: { width: 12, height: 12 },
        },
        altText: {
          name: "Location",
          description: "Location",
          title: "Location",
        },
      })
    );
    contactRuns.push(
      new TextRun({
        text: `\u00a0${safeStr(templateData.location)}`,
        font: FONT,
        size: PT(10),
      })
    );
  }
  if (templateData.linkedin) {
    pushGap();
    const u = softBreakUrl(templateData.linkedin);
    contactRuns.push(
      new ImageRun({
        type: "svg",
        data: Buffer.from(LINKEDIN_SVG_MARKUP, "utf8"),
        transformation: { width: 12, height: 12 },
        fallback: {
          type: "png",
          data: TINY_PNG_PIXEL,
          transformation: { width: 12, height: 12 },
        },
        altText: {
          name: "LinkedIn",
          description: "LinkedIn",
          title: "LinkedIn",
        },
      })
    );
    contactRuns.push(
      new TextRun({
        text: `\u00a0${u}`,
        font: FONT,
        size: PT(10),
      })
    );
  }
  if (templateData.website) {
    pushGap();
    contactRuns.push(
      new TextRun({
        text: `\u2794 ${softBreakUrl(templateData.website)}`,
        font: FONT,
        size: PT(10),
      })
    );
  }

  if (contactRuns.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 220, line: 276, lineRule: LineRuleType.AUTO },
        children: contactRuns,
      })
    );
  } else {
    children.push(new Paragraph({ text: "", spacing: { after: 132 } }));
  }

  const summary = safeStr(templateData.summary)
    .replace(/\s*\n+\s*/g, " ")
    .trim();
  if (summary) {
    children.push(sectionHeading("SUMMARY"));
    children.push(
      new Paragraph({
        spacing: {
          after: 200,
          line: 292,
          lineRule: LineRuleType.AUTO,
        },
        children: [new TextRun({ text: summary, font: FONT, size: PT(11) })],
      })
    );
  }

  const skills = templateData.skills || {};
  const skillCategories = Object.entries(skills).filter(
    ([, list]) => Array.isArray(list) && list.length > 0
  );
  if (skillCategories.length > 0) {
    children.push(sectionHeading("SKILLS"));
    for (const [category, list] of skillCategories) {
      children.push(
        new Paragraph({
          spacing: {
            after: 36,
            line: 286,
            lineRule: LineRuleType.AUTO,
          },
          children: [
            new TextRun({
              text: "\u2022 ",
              font: FONT,
              size: PT(10),
            }),
            new TextRun({
              text: `${safeStr(category)}: `,
              bold: true,
              font: FONT,
              size: PT(10),
            }),
            new TextRun({
              text: list.map(safeStr).join(", "),
              font: FONT,
              size: PT(10),
            }),
          ],
        })
      );
    }
    children.push(new Paragraph({ text: "", spacing: { after: 96 } }));
  }

  const experience = templateData.experience || [];
  if (experience.length > 0) {
    // keepWithNext so the section title does not sit alone at a page foot.
    children.push(sectionHeading("PROFESSIONAL EXPERIENCE", { keepWithNext: true }));
    for (const exp of experience) {
      const dateStr = singleLineDateRange([
        exp.start_date,
        exp.end_date,
      ].filter(Boolean));
      const detailLines = (exp.details || []).filter((d) =>
        String(d ?? "").trim()
      );
      const companyLine = [exp.company, exp.location]
        .filter(Boolean)
        .map(safeStr)
        .join(", ");
      // Chain keepNext through title → company → first 2 bullets so the role
      // header moves to the next page with its opening bullets.
      const glueThrough = Math.min(2, detailLines.length);

      children.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: RIGHT_TAB_POS },
          ],
          spacing: { after: 48 },
          keepNext: true,
          children: [
            new TextRun({
              text: safeStr(exp.title) || "Engineer",
              bold: true,
              font: FONT,
              size: PT(11),
            }),
            new TextRun({ text: "\t", font: FONT }),
            new TextRun({
              text: dateStr,
              bold: true,
              font: FONT,
              size: PT(10),
            }),
          ],
        })
      );

      if (companyLine) {
        children.push(
          new Paragraph({
            spacing: { after: 96 },
            widowControl: true,
            keepNext: detailLines.length > 0,
            children: [
              new TextRun({
                text: companyLine,
                italics: true,
                font: FONT,
                size: PT(10),
              }),
            ],
          })
        );
      }

      detailLines.forEach((detail, detailIdx) => {
        children.push(
          new Paragraph({
            spacing: {
              after: 48,
              line: 292,
              lineRule: LineRuleType.AUTO,
            },
            keepNext: detailIdx < glueThrough - 1,
            children: [
              new TextRun({
                text: "\u2022 ",
                font: FONT,
                size: PT(10),
              }),
              new TextRun({
                text: safeStr(detail),
                font: FONT,
                size: PT(10),
              }),
            ],
          })
        );
      });
      children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
    }
  }

  const certifications = Array.isArray(templateData.certifications)
    ? templateData.certifications
    : [];
  if (certifications.length > 0) {
    children.push(sectionHeading("CERTIFICATIONS", { keepWithNext: true }));
    for (const cert of certifications) {
      const name =
        typeof cert === "string"
          ? safeStr(cert)
          : safeStr(cert?.name || cert?.title || "");
      if (!name) continue;
      const issuer =
        typeof cert === "object"
          ? safeStr(cert.issuer || cert.org || "")
          : "";
      const date =
        typeof cert === "object"
          ? safeStr(cert.date || cert.year || "")
          : "";

      children.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: RIGHT_TAB_POS },
          ],
          spacing: { after: issuer ? 48 : 120 },
          keepNext: Boolean(issuer),
          children: [
            new TextRun({
              text: name,
              bold: true,
              font: FONT,
              size: PT(11),
            }),
            ...(date
              ? [
                  new TextRun({ text: "\t", font: FONT }),
                  new TextRun({
                    text: date,
                    bold: true,
                    font: FONT,
                    size: PT(10),
                  }),
                ]
              : []),
          ],
        })
      );

      if (issuer) {
        children.push(
          new Paragraph({
            spacing: {
              after: 120,
              line: 280,
              lineRule: LineRuleType.AUTO,
            },
            children: [
              new TextRun({
                text: issuer,
                italics: true,
                font: FONT,
                size: PT(10),
              }),
            ],
          })
        );
      }
    }
  }

  const education = templateData.education || [];
  if (education.length > 0) {
    children.push(sectionHeading("EDUCATION", { keepWithNext: true }));
    for (const edu of education) {
      const yearLeft = edu.start_year ? safeStr(edu.start_year) : "";
      const yearRight = edu.end_year ? safeStr(edu.end_year) : "";
      const yearStr = singleLineDateRange(
        yearLeft && yearRight ? [yearLeft, yearRight] : [yearLeft || yearRight]
      );

      children.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: RIGHT_TAB_POS },
          ],
          spacing: { after: 48 },
          keepNext: true,
          children: [
            new TextRun({
              text: safeStr(edu.degree),
              bold: true,
              font: FONT,
              size: PT(11),
            }),
            new TextRun({ text: "\t", font: FONT }),
            new TextRun({
              text: yearStr,
              bold: true,
              font: FONT,
              size: PT(10),
            }),
          ],
        })
      );

      const schoolBits = [edu.school, edu.grade && `GPA: ${safeStr(edu.grade)}`]
        .filter(Boolean)
        .join(" • ");
      if (schoolBits) {
        children.push(
          new Paragraph({
            spacing: {
              after: 176,
              line: 280,
              lineRule: LineRuleType.AUTO,
            },
            widowControl: true,
            children: [
              new TextRun({
                text: schoolBits,
                italics: true,
                font: FONT,
                size: PT(10),
              }),
            ],
          })
        );
      }
    }
  }

  const doc = new Document({
    title: "Resume",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: pageWidthTwip,
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
