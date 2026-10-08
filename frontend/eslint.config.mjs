import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "out/**"] },
  {
    rules: {
      // Uploaded wireframes / external images are plain <img> by design (unknown sizes, Blob or local URLs).
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
