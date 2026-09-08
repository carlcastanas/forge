import type { NextConfig } from 'next';

/**
 * The site renders entirely at build time from markdown that lives in the parent
 * repository, so a fully static export is the correct output. Nothing here reaches
 * the network at runtime.
 */
const nextConfig: NextConfig = {
  output: 'export',
  // Several lockfiles exist above this directory; pin tracing to the site itself.
  outputFileTracingRoot: import.meta.dirname,
  trailingSlash: true,
  images: {
    // Static export cannot run the image optimizer.
    unoptimized: true,
  },
  // Markdown in the parent repo is authored by other tooling; a stray link should not
  // be able to fail the production build.
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
