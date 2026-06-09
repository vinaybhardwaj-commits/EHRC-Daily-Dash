import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['mammoth', '@react-pdf/renderer'],
};

export default nextConfig;
