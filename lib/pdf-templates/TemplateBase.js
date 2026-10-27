import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { extractYear, BoldText } from './utils';
import {
    PdfIconLink,
    PdfIconLinkedIn,
    PdfIconMail,
    PdfIconPhone,
    PdfIconPin,
} from './PdfIcons';

// Classic résumé: black on white
const INK = "#000000";

// Base template component that accepts styling configuration
export const createResumeTemplate = (config) => {
    const {
        fonts = {},
        sectionTitles = {},
        headerLayout = 'center', // 'center' or 'split'
    } = config;

    const styles = StyleSheet.create({
        page: {
            /** ~1 cm sides; résumé density without oversized margins */
            padding: "10mm",
            fontSize: fonts.baseSize || 11,
            fontFamily: fonts.body || "Helvetica",
            color: INK,
        },
        header: {
            width: "100%",
            textAlign: headerLayout === "center" ? "center" : "left",
            marginBottom: 12,
            paddingBottom: 4,
        },
        headerContent: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        headerLeft: {},
        headerContactCol: {
            alignItems: "flex-end",
        },
        name: {
            fontSize: fonts.nameSize || 22,
            fontFamily: fonts.title || "Helvetica-Bold",
            fontWeight: "bold",
            marginBottom: 4,
            color: INK,
            textTransform: "none",
        },
        title: {
            fontSize: fonts.titleSize || 11,
            fontFamily: fonts.body || "Helvetica",
            fontStyle: "italic",
            fontWeight: "normal",
            marginBottom: 6,
            color: INK,
        },
        contact: {
            fontSize: fonts.contactSize || 10,
            fontFamily: fonts.body || "Helvetica",
            color: INK,
            lineHeight: 1.52,
            letterSpacing: 0.12,
            textAlign: headerLayout === "split" ? "right" : "center",
        },
        contactSecond: {
            fontSize: fonts.contactSize || 10,
            fontFamily: fonts.body || "Helvetica",
            color: INK,
            lineHeight: 1.52,
            letterSpacing: 0.12,
            marginTop: 2,
            textAlign: headerLayout === "split" ? "right" : "center",
        },
        contactRowWrap: {
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: headerLayout === "split" ? "flex-end" : "center",
            alignItems: "center",
            alignSelf: headerLayout === "split" ? "stretch" : "center",
            width: "100%",
            marginTop: 2,
        },
        /** Each chip keeps intrinsic width; whole chips wrap to the next line — avoids yoga squeezing text into ultra-narrow columns. */
        contactChip: {
            flexDirection: "row",
            alignItems: "center",
            flexShrink: 0,
            marginBottom: 4,
            paddingHorizontal: 5,
            maxWidth: "100%",
        },
        contactRow: {
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 3,
        },
        contactIcon: {
            width: 12,
            marginRight: 6,
            alignItems: "center",
            justifyContent: "center",
        },
        contactLineText: {
            fontSize: fonts.contactSize || 10,
            fontFamily: fonts.body || "Helvetica",
            color: INK,
            lineHeight: 1.52,
            letterSpacing: 0.12,
            maxWidth: "100%",
        },
        contactItem: {
            marginBottom: headerLayout === "split" ? 3 : 0,
        },
        section: {
            marginBottom: 11,
        },
        sectionTitle: {
            fontSize: fonts.sectionSize || 10.5,
            fontFamily: fonts.title || "Helvetica-Bold",
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: 0.55,
            color: INK,
            marginBottom: 5,
            paddingBottom: 3,
            borderBottomWidth: 1,
            borderBottomColor: INK,
        },
        summary: {
            fontSize: fonts.summarySize || 11,
            fontFamily: fonts.body || "Helvetica",
            lineHeight: 1.45,
            letterSpacing: 0.2,
            textAlign: "left",
            color: INK,
        },
        summaryRow: {
            marginBottom: 3,
            width: "100%",
        },
        /** One flowing line per category: bullet + bold label + comma list (no column gap). */
        skillsRow: {
            marginBottom: 4,
            width: "100%",
        },
        skillsBody: {
            fontSize: fonts.skillsListSize || 10,
            fontFamily: fonts.body || "Helvetica",
            lineHeight: 1.34,
            letterSpacing: 0.15,
            color: INK,
        },
        expItem: {
            marginBottom: 11,
        },
        expHeader: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 3,
        },
        expTitle: {
            fontSize: fonts.expTitleSize || 11,
            fontFamily: fonts.title || "Helvetica-Bold",
            fontWeight: "bold",
            color: INK,
            // Avoid flex:1 on Text — react-pdf can stack siblings on the same Y.
            maxWidth: "70%",
            paddingRight: 8,
            letterSpacing: 0.12,
            lineHeight: 1.35,
        },
        expDates: {
            fontSize: fonts.expDatesSize || 10,
            fontFamily: fonts.title || "Helvetica-Bold",
            fontWeight: "bold",
            color: INK,
            letterSpacing: 0.1,
            lineHeight: 1.35,
        },
        expCompany: {
            fontSize: fonts.expCompanySize || 10,
            fontFamily: fonts.body || "Helvetica",
            color: INK,
            marginBottom: 5,
            fontStyle: "italic",
            lineHeight: 1.38,
            letterSpacing: 0.12,
        },
        expDetails: {
            marginLeft: 4,
        },
        expDetailItem: {
            fontSize: fonts.expDetailSize || 10,
            fontFamily: fonts.body || "Helvetica",
            lineHeight: 1.42,
            letterSpacing: 0.18,
            color: INK,
            marginBottom: 4,
        },
        eduItem: {
            marginBottom: 10,
        },
        eduHeader: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 2,
        },
        eduDegree: {
            fontSize: fonts.eduDegreeSize || 11,
            fontFamily: fonts.title || "Helvetica-Bold",
            fontWeight: "bold",
            color: INK,
            maxWidth: "70%",
            paddingRight: 8,
            letterSpacing: 0.1,
            lineHeight: 1.35,
        },
        eduDates: {
            fontSize: fonts.eduDatesSize || 10,
            fontFamily: fonts.title || "Helvetica-Bold",
            fontWeight: "bold",
            color: INK,
            letterSpacing: 0.08,
            lineHeight: 1.35,
        },
        eduSchool: {
            fontSize: fonts.eduSchoolSize || 10,
            fontFamily: fonts.body || "Helvetica",
            color: INK,
            fontStyle: "italic",
            lineHeight: 1.38,
            letterSpacing: 0.12,
        },
    });

    const TemplateComponent = ({ data }) => {
        const safe = data && typeof data === "object" ? data : {};
        const {
            name,
            title,
            email,
            phone,
            location,
            linkedin,
            website,
            summary,
            skills,
            experience,
            certifications,
            education,
        } = safe;

        const contactRows = [];
        if (email) contactRows.push({ Icon: PdfIconMail, text: email });
        if (phone) contactRows.push({ Icon: PdfIconPhone, text: phone });
        if (location) contactRows.push({ Icon: PdfIconPin, text: location });
        if (linkedin) contactRows.push({ Icon: PdfIconLinkedIn, text: linkedin });
        if (website) contactRows.push({ Icon: PdfIconLink, text: website });

        const renderContactBlock = () => {
            if (contactRows.length === 0) return null;
            return (
                <View style={styles.contactRowWrap}>
                    {contactRows.map(({ Icon, text }, i) => (
                        <View key={i} style={styles.contactChip} wrap={false}>
                            <View style={styles.contactIcon}>
                                <Icon size={10} color={INK} />
                            </View>
                            <Text style={styles.contactLineText}>{text}</Text>
                        </View>
                    ))}
                </View>
            );
        };

        const renderHeader = () => {
            if (headerLayout === "split") {
                return (
                    <View style={styles.header}>
                        <View style={styles.headerContent}>
                            <View style={styles.headerLeft}>
                                <Text style={styles.name}>{name}</Text>
                                {title && <Text style={styles.title}>{title}</Text>}
                            </View>
                            <View style={styles.headerContactCol}>
                                {renderContactBlock()}
                            </View>
                        </View>
                    </View>
                );
            }

            return (
                <View style={styles.header}>
                    <Text style={styles.name}>{name}</Text>
                    {title && <Text style={styles.title}>{title}</Text>}
                    {renderContactBlock()}
                </View>
            );
        };

        return (
            <Document>
                <Page size="A4" style={styles.page}>
                    {renderHeader()}

                    {summary && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{sectionTitles.summary || 'Summary'}</Text>
                            <BoldText
                                text={String(summary).replace(/\s*\n+\s*/g, " ").trim()}
                                style={styles.summary}
                            />
                        </View>
                    )}

                    {skills && Object.keys(skills).length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                                {sectionTitles.skills || "SKILLS"}
                            </Text>
                            {Object.entries(skills).map(([category, skillList], idx) => {
                                const joined = Array.isArray(skillList)
                                    ? skillList.join(", ")
                                    : String(skillList);
                                const line = `**${category}**: ${joined}`;
                                return (
                                    <View key={idx} style={styles.skillsRow}>
                                        <BoldText
                                            text={line}
                                            style={styles.skillsBody}
                                            prefix={"\u2022 "}
                                        />
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {experience && experience.length > 0 && (
                        <View style={styles.section}>
                            {experience.map((exp, idx) => {
                                const detailLines = (exp.details || []).filter((d) =>
                                    String(d ?? "").trim()
                                );
                                // Glue header + first bullets so orphan titles at page foot
                                // pull the whole block to the next page with the bullets.
                                const gluedCount = Math.min(2, detailLines.length);
                                const gluedDetails = detailLines.slice(0, gluedCount);
                                const restDetails = detailLines.slice(gluedCount);
                                return (
                                <View key={idx} style={styles.expItem}>
                                    {/*
                                      Empty View first: react-pdf wrap={false} height bug workaround.
                                      Large minPresenceAhead + first bullets inside wrap={false}
                                      so PROFESSIONAL EXPERIENCE / job headers are not left alone
                                      at the bottom of a page.
                                    */}
                                    <View>
                                        <View style={{ height: 0 }} />
                                        <View
                                            wrap={false}
                                            minPresenceAhead={idx === 0 ? 240 : 180}
                                        >
                                            {idx === 0 && (
                                                <Text style={styles.sectionTitle}>
                                                    {sectionTitles.experience || "Experience"}
                                                </Text>
                                            )}
                                            <View style={styles.expHeader}>
                                                <Text style={styles.expTitle}>
                                                    {exp.title || "Engineer"}
                                                </Text>
                                                <Text style={styles.expDates}>
                                                    {exp.start_date} – {exp.end_date}
                                                </Text>
                                            </View>
                                            <Text style={styles.expCompany}>
                                                {exp.company}
                                                {exp.location && `, ${exp.location}`}
                                            </Text>
                                            {gluedDetails.length > 0 && (
                                                <View style={styles.expDetails}>
                                                    {gluedDetails.map((detail, detailIdx) => (
                                                        <BoldText
                                                            key={detailIdx}
                                                            text={String(detail)}
                                                            style={styles.expDetailItem}
                                                            prefix={"\u2022 "}
                                                        />
                                                    ))}
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    {restDetails.length > 0 && (
                                        <View style={styles.expDetails}>
                                            {restDetails.map((detail, detailIdx) => (
                                                <BoldText
                                                    key={detailIdx + gluedCount}
                                                    text={String(detail)}
                                                    style={styles.expDetailItem}
                                                    prefix={"\u2022 "}
                                                />
                                            ))}
                                        </View>
                                    )}
                                </View>
                                );
                            })}
                        </View>
                    )}

                    {Array.isArray(certifications) && certifications.length > 0 && (
                        <View style={styles.section} wrap={false}>
                            <Text
                                style={styles.sectionTitle}
                                minPresenceAhead={80}
                            >
                                {sectionTitles.certifications || "CERTIFICATIONS"}
                            </Text>
                            {certifications.map((cert, idx) => {
                                const name =
                                    typeof cert === "string"
                                        ? cert
                                        : cert?.name || cert?.title || "";
                                if (!name) return null;
                                const issuer =
                                    typeof cert === "object"
                                        ? cert.issuer || cert.org || ""
                                        : "";
                                const date =
                                    typeof cert === "object"
                                        ? cert.date || cert.year || ""
                                        : "";
                                return (
                                    <View key={idx} style={styles.eduItem}>
                                        <View style={styles.eduHeader}>
                                            <Text style={styles.eduDegree}>{name}</Text>
                                            {date ? (
                                                <Text style={styles.eduDates}>{date}</Text>
                                            ) : null}
                                        </View>
                                        {issuer ? (
                                            <Text style={styles.eduSchool}>{issuer}</Text>
                                        ) : null}
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {education && education.length > 0 && (
                        <View style={styles.section} wrap={false}>
                            {/* Keep EDUCATION title with its content — never orphan the header alone. */}
                            <Text
                                style={styles.sectionTitle}
                                minPresenceAhead={90}
                            >
                                {sectionTitles.education || 'Education'}
                            </Text>
                            {education.map((edu, idx) => (
                                <View key={idx} style={styles.eduItem}>
                                    <View>
                                        <View style={styles.eduHeader}>
                                            <Text style={styles.eduDegree}>{edu.degree}</Text>
                                            <Text style={styles.eduDates}>
                                                {extractYear(edu.start_year)}
                                                {edu.end_year && ` – ${extractYear(edu.end_year)}`}
                                            </Text>
                                        </View>
                                        <Text style={styles.eduSchool}>
                                            {edu.school}
                                            {edu.grade && ` • GPA: ${edu.grade}`}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </Page>
            </Document>
        );
    };

    return TemplateComponent;
};

