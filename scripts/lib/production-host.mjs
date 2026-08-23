function normalizedIpHostname(host) {
  return host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
}

function ipv4OctetsFromHostname(host) {
  const normalized = normalizedIpHostname(host);
  const dotted = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (dotted) return dotted.slice(1).map(Number);

  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(normalized);
  if (!mapped) return null;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >>> 8, high & 0xff, low >>> 8, low & 0xff];
}

function isLocalOnlyHostname(host) {
  const normalized = normalizedIpHostname(host);
  if (normalized === "::" || normalized === "::1") return true;
  const ipv4 = ipv4OctetsFromHostname(normalized);
  if (!ipv4) return false;
  return ipv4.every((octet) => octet === 0) || ipv4[0] === 127;
}

function isNonUnicastHostname(host) {
  const normalized = normalizedIpHostname(host);
  const ipv4 = ipv4OctetsFromHostname(normalized);
  if (ipv4) return ipv4[0] === 0 || ipv4[0] >= 224;
  return /^ff[0-9a-f]{2}:/i.test(normalized);
}

function isLinkLocalDocumentationOrBenchmarkAddress(host) {
  const normalized = normalizedIpHostname(host);
  const ipv4 = ipv4OctetsFromHostname(normalized);
  if (ipv4) {
    const [first, second, third] = ipv4;
    if (first === 169 && second === 254) return true;
    if (first === 192 && second === 0 && third === 2) return true;
    if (first === 198 && (second === 18 || second === 19)) return true;
    if (first === 198 && second === 51 && third === 100) return true;
    if (first === 203 && second === 0 && third === 113) return true;
    return false;
  }
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true;
  if (/^fe[c-f][0-9a-f]:/i.test(normalized)) return true;
  if (/^2001:db8(?::|$)/i.test(normalized)) return true;
  if (/^2001:2:(?:0(?::|$)|:)/i.test(normalized)) return true;
  return /^3fff:(?::|[0-9a-f]{1,3}(?::|$))/i.test(normalized);
}

export function isReservedProductionHostname(host) {
  if (
    host === "localhost"
    || host.endsWith(".localhost")
    || host === "local"
    || host.endsWith(".local")
    || isLocalOnlyHostname(host)
    || isNonUnicastHostname(host)
    || isLinkLocalDocumentationOrBenchmarkAddress(host)
  ) return true;

  if (
    host === "example"
    || host.endsWith(".example")
    || host === "invalid"
    || host.endsWith(".invalid")
    || host === "test"
    || host.endsWith(".test")
  ) return true;

  return ["example.com", "example.net", "example.org"].some(
    (reservedHost) => host === reservedHost || host.endsWith(`.${reservedHost}`),
  );
}
