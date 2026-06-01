import { isIP } from 'node:net';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeHostname(value) {
  const host = normalizeText(value).toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) return host.slice(1, -1);
  return host;
}

function parseIpv4Parts(host) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split('.').map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function mappedIpv4PartsFromIpv6(host) {
  if (host.includes('.')) return parseIpv4Parts(host.split(':').at(-1) || '');
  if (!host.startsWith('::ffff:')) return null;
  const groups = host.slice('::ffff:'.length).split(':').filter(Boolean);
  if (groups.length < 2) return null;
  const high = Number.parseInt(groups.at(-2) || '', 16);
  const low = Number.parseInt(groups.at(-1) || '', 16);
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) {
    return null;
  }
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isNonPublicIpv4Host(host) {
  const parts = parseIpv4Parts(host);
  if (!parts) return false;
  const [first, second, third] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isNonPublicIpv6Host(host) {
  if (host === '::' || host === '::1') return true;

  const mappedIpv4Parts = mappedIpv4PartsFromIpv6(host);
  if (mappedIpv4Parts) return isNonPublicIpv4Host(mappedIpv4Parts.join('.'));

  const [firstText, secondText] = host.split(':');
  const first = Number.parseInt(firstText || '0', 16);
  const second = Number.parseInt(secondText || '0', 16);
  if (!Number.isInteger(first)) return true;

  return (
    first === 0 ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x2001 && second === 0x0db8)
  );
}

export function isNonPublicHostname(value) {
  const host = normalizeHostname(value);
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const ipVersion = isIP(host);
  if (ipVersion === 4) return isNonPublicIpv4Host(host);
  if (ipVersion === 6) return isNonPublicIpv6Host(host);
  return false;
}

export function isPublicHttpUrl(value) {
  const text = normalizeText(value);
  if (!text) return false;
  try {
    const url = new URL(text);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !isNonPublicHostname(url.hostname);
  } catch {
    return false;
  }
}

