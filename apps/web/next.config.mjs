/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @dgb/shared ships ESM; let Next transpile it for the client/server bundles.
  transpilePackages: ['@dgb/shared'],
  // Single-container deployment: the browser talks only to the web origin, and
  // Next proxies the API paths to the Nest process on the same host. This keeps
  // everything same-origin (no CORS) and means judges only need one URL.
  // In local dev these rewrites are inert because the web calls the API directly
  // via NEXT_PUBLIC_API_BASE_URL; they only matter when that base is empty.
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || 'http://127.0.0.1:3001';
    const proxied = ['reviews', 'attachments', 'health', 'telemetry'];
    return proxied.map((prefix) => ({
      source: `/${prefix}/:path*`,
      destination: `${apiUrl}/${prefix}/:path*`,
    }));
  },
};

export default nextConfig;
