import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: "25mm",
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#111111",
    lineHeight: 1.5,
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    marginBottom: 6,
  },
  contact: {
    fontSize: 10,
    marginBottom: 22,
  },
  spacer: {
    marginBottom: 18,
  },
  paragraph: {
    marginBottom: 11,
    textAlign: "justify",
  },
});

export default function CoverLetterPdf({
  name,
  email,
  phone,
  location,
  linkedin,
  paragraphs = [],
}) {
  const contactParts = [email, phone, location, linkedin].filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {name ? <Text style={styles.name}>{String(name)}</Text> : null}
        {contactParts.length > 0 ? (
          <Text style={styles.contact}>{contactParts.join(" · ")}</Text>
        ) : (
          <View style={styles.spacer} />
        )}
        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {String(p)}
          </Text>
        ))}
      </Page>
    </Document>
  );
}
