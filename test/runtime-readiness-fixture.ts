async function privateKeyPem(algorithm: RsaHashedKeyGenParams | "Ed25519"): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    algorithm,
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const base64 = Buffer.from(pkcs8).toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----`;
}

/** Supply complete, importable continuation bindings to readiness tests focused on another boundary. */
export async function continuationReadyBindings(namespace: DurableObjectNamespace) {
  const githubPrivateKey = await privateKeyPem({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  });
  return {
    GITHUB_APP_PRIVATE_KEY_PEM: githubPrivateKey,
    CONTINUATION_DISPATCH_GITHUB_APP_ID: "223344",
    CONTINUATION_DISPATCH_GITHUB_APP_PRIVATE_KEY_PEM: githubPrivateKey,
    CONTINUATION_DISPATCH_GITHUB_APP_INSTALLATION_ID: "445566",
    CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM: await privateKeyPem("Ed25519"),
    CONTINUATION_RECEIPT_SIGNING_KEY_ID: "noema-continuation-test",
    NOEMA_CONTINUATION_DISPATCH_STATE: namespace,
  };
}
