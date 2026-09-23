import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle for a small runtime image.
  output: 'standalone',
  // Without this, Next walks up past the repo looking for a workspace root and
  // nests the standalone build under the absolute source path.
  outputFileTracingRoot: path.join(__dirname),
  reactStrictMode: true,
};

export default nextConfig;
