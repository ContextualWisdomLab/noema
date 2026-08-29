const pkcs8PemPattern = /^-----BEGIN PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END PRIVATE KEY-----\r?\n?$/;
const pkcs1PemPattern = /^-----BEGIN RSA PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END RSA PRIVATE KEY-----\r?\n?$/;
const MAX_PRIVATE_KEY_PEM_BYTES = 65_536;
const MIN_GITHUB_RSA_PRIVATE_KEY_DER_BYTES = 256;
const rsaEncryptionAlgorithmIdentifier = Uint8Array.of(
  0x30, 0x0d,
  0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00,
);
const pkcs8VersionZero = Uint8Array.of(0x02, 0x01, 0x00);

function canonicalPemDer(encodedBody: string): Uint8Array | undefined {
  const compact = encodedBody.replace(/\r?\n/g, "");
  try {
    const binary = atob(compact);
    if (btoa(binary) !== compact) return undefined;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function twoByteDerLength(length: number): Uint8Array {
  return Uint8Array.of(0x82, (length >>> 8) & 0xff, length & 0xff);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function wrapPkcs1AsPkcs8(pkcs1Der: Uint8Array): Uint8Array | undefined {
  if (pkcs1Der.length < MIN_GITHUB_RSA_PRIVATE_KEY_DER_BYTES) return undefined;
  const privateKeyOctetString = concatBytes(
    Uint8Array.of(0x04),
    twoByteDerLength(pkcs1Der.length),
    pkcs1Der,
  );
  const privateKeyInfoBody = concatBytes(
    pkcs8VersionZero,
    rsaEncryptionAlgorithmIdentifier,
    privateKeyOctetString,
  );
  return concatBytes(
    Uint8Array.of(0x30),
    twoByteDerLength(privateKeyInfoBody.length),
    privateKeyInfoBody,
  );
}

function pemFromDer(label: "PRIVATE KEY", der: Uint8Array): string {
  let binary = "";
  for (const byte of der) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

/**
 * Converts the PKCS#1 RSA private-key PEM downloaded from GitHub Apps into the PKCS#8
 * envelope consumed by WebCrypto while preserving an already-reviewed PKCS#8 envelope.
 * Unknown labels, oversized inputs, non-canonical base64, and implausibly small PKCS#1
 * payloads are rejected rather than normalized into credential authority. One conventional
 * terminal PEM newline is removed so the accepted outer envelope matches the downstream
 * WebCrypto import boundary without changing the DER key identity.
 *
 * @param value GitHub App private-key PEM supplied by the Worker secret binding.
 * @returns A PKCS#8 `PRIVATE KEY` PEM suitable for WebCrypto, or `undefined` when the
 * credential envelope cannot be safely interpreted.
 */
export function normalizeGitHubAppPrivateKeyPem(value: string | undefined): string | undefined {
  if (value === undefined || new TextEncoder().encode(value).byteLength > MAX_PRIVATE_KEY_PEM_BYTES) {
    return undefined;
  }

  const pkcs8Match = pkcs8PemPattern.exec(value);
  if (pkcs8Match) {
    return canonicalPemDer(pkcs8Match[1]) === undefined ? undefined : value.replace(/\r?\n$/, "");
  }

  const pkcs1Match = pkcs1PemPattern.exec(value);
  if (!pkcs1Match) return undefined;
  const pkcs1Der = canonicalPemDer(pkcs1Match[1]);
  if (!pkcs1Der) return undefined;
  const pkcs8Der = wrapPkcs1AsPkcs8(pkcs1Der);
  return pkcs8Der ? pemFromDer("PRIVATE KEY", pkcs8Der) : undefined;
}
