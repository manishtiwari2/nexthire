/**
 * Derives the "who/where/what" of a request for session records and the security
 * timeline: client IP plus a coarse browser / OS / device label.
 *
 * The User-Agent parsing here is intentionally small and heuristic. It exists to render
 * "Chrome on Windows" in the sessions list, not to fingerprint — no dependency and no
 * behaviour depends on getting it exactly right.
 */

const MAX_UA_LENGTH = 512;

/**
 * Client IP. `X-Forwarded-For` is only honoured when the app is explicitly told it sits
 * behind a proxy (TRUST_PROXY), because otherwise any client can spoof the header and
 * poison rate-limit buckets and audit records.
 */
function clientIp(req) {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
      const first = forwarded.split(',')[0].trim();
      if (first) return normalizeIp(first);
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) return normalizeIp(realIp.trim());
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
}

/** Collapse IPv4-mapped IPv6 and loopback into something readable. */
function normalizeIp(ip) {
  if (!ip) return null;
  let value = String(ip).trim();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (value === '::1') value = '127.0.0.1';
  return value.slice(0, 64) || null;
}

const BROWSERS = [
  // Order matters: Edge/Opera/Brave all claim to be Chrome, so match them first.
  [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Edge'],
  [/OPR\/([\d.]+)|Opera\/([\d.]+)/, 'Opera'],
  [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
  [/Firefox\/([\d.]+)|FxiOS\/([\d.]+)/, 'Firefox'],
  [/Chrome\/([\d.]+)|CriOS\/([\d.]+)/, 'Chrome'],
  [/Version\/([\d.]+).*Safari/, 'Safari'],
  [/Safari\/([\d.]+)/, 'Safari'],
  [/curl\/([\d.]+)/, 'curl'],
  [/PostmanRuntime\/([\d.]+)/, 'Postman'],
  [/node|axios|undici/i, 'HTTP client'],
];

const PLATFORMS = [
  [/Windows NT 10\.0/, 'Windows'],
  [/Windows NT/, 'Windows'],
  [/Android/, 'Android'],
  [/(iPhone|iPod)/, 'iOS'],
  [/iPad/, 'iPadOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

function parseUserAgent(rawUserAgent) {
  const ua = typeof rawUserAgent === 'string' ? rawUserAgent.slice(0, MAX_UA_LENGTH) : '';
  if (!ua) return { userAgent: null, browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

  let browser = 'Unknown';
  for (const [pattern, name] of BROWSERS) {
    const match = ua.match(pattern);
    if (match) {
      const version = (match[1] || match[2] || '').split('.')[0];
      browser = version ? `${name} ${version}` : name;
      break;
    }
  }

  let os = 'Unknown';
  for (const [pattern, name] of PLATFORMS) {
    if (pattern.test(ua)) {
      os = name;
      break;
    }
  }

  let device = 'Desktop';
  if (/iPad|Tablet/i.test(ua)) device = 'Tablet';
  else if (/Mobi|iPhone|Android.*Mobile/i.test(ua)) device = 'Mobile';
  else if (/curl|Postman|axios|node|undici/i.test(ua)) device = 'API client';

  return { userAgent: ua, browser, os, device };
}

/** Everything session/audit records need, in one call. */
function describeRequest(req) {
  return {
    ipAddress: clientIp(req),
    ...parseUserAgent(req.headers['user-agent']),
  };
}

module.exports = { describeRequest, parseUserAgent, clientIp };
