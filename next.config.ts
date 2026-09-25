import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // The agreement PDF reads the builder's fonts from public/fonts/agreement
  // (src/lib/pdf/AgreementDocument.tsx). Files in public/ are served, not
  // bundled into server functions, so a PDF generated on Vercel would fail to
  // open them without this. Every route, because agreement PDFs are rendered
  // by server actions called from several pages; the fonts are 2.5 MB.
  outputFileTracingIncludes: {
    "/*": ["./public/fonts/agreement/**/*"],
  },
};

export default nextConfig;
