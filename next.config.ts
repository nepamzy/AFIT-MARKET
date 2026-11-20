import type { NextConfig } from 'next'

const commonHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]
// Location is allowed for this site's own pages (never for embedded third parties). Nothing asks for it except the screens that
// say so: the rider's shift, the customer while their order is on its way, and the shop's phone while it has open orders. The
// browser still asks each person once. (It used to be blocked everywhere but the rider and order pages, so the shop's phone and
// the "Allow location" button never got the browser's question.)
const POLICY = {
  key: 'Permissions-Policy',
  value: 'camera=(self), microphone=(), geolocation=(self), payment=()',
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // `forbidden()` (HTTP 403 pages) is still experimental in Next 16; tracked in docs/known-issues.md.
  // the rider sign-up sends two ID card photos with the form, which is more than the 1 MB default
  experimental: { authInterrupts: true, serverActions: { bodySizeLimit: '4mb' } },
  async redirects() {
    return [
      { source: '/refunds', destination: '/reports', permanent: true },
      { source: '/legal/refunds', destination: '/legal/reports', permanent: true },
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: commonHeaders },
      // site pictures, the logo and ready-made item photos never change under the same name: keep them in the browser and on the network
      {
        source: '/:folder(catalogue|art|brand|icons)/:file*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800',
          },
        ],
      },
      { source: '/:path*', headers: [POLICY] },
    ]
  },
}

export default nextConfig
