import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Keep the full react-pdf graph out of the bundler — bundling it under React 19
  // recreates: Cannot read properties of undefined (reading 'hasOwnProperty').
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/reconciler",
    "@react-pdf/layout",
    "@react-pdf/font",
    "@react-pdf/render",
    "@react-pdf/pdfkit",
    "@react-pdf/image",
    "@react-pdf/png-js",
    "@react-pdf/stylesheet",
    "@react-pdf/textkit",
    "@react-pdf/primitives",
    "@react-pdf/fns",
    "@react-pdf/svg",
    "@react-pdf/types",
    "yoga-layout",
    "pdfkit",
  ],
};

export default nextConfig;
