import createMDX from "@next/mdx";

const withMDX = createMDX({ extension: /\.mdx?$/ });

export default withMDX({
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  allowedDevOrigins: ["127.0.0.1"],
});
