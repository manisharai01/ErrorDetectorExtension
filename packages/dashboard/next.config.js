/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 is a native module — keep it external so Next doesn't try to
  // bundle the .node binary.
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3']
  }
};

module.exports = nextConfig;
