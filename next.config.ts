import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // The repo lives inside a folder that has its own lockfile; pin the root.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
