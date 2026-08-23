function requireRecord(value, label) {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    throw new Error(`${label} must be a JSON record`);
  }
  return value;
}

function normalizedDatabaseIdentity(rawDatabase, label) {
  const database = requireRecord(rawDatabase, `${label} database evidence`);
  const status = requireRecord(database.status, `${label} database status evidence`);
  const providers = requireRecord(
    database.providers,
    `${label} database providers evidence`,
  );
  const normalizedProviders = Object.entries(providers)
    .map(([name, rawProvider]) => {
      const provider = requireRecord(
        rawProvider,
        `${label} database provider evidence`,
      );
      return [
        name,
        {
          captured: provider.captured,
          input: provider.input,
        },
      ];
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify({
    schema_version: status.schemaVersion,
    built_at: status.built,
    valid: status.valid,
    error: status.error ?? null,
    providers: normalizedProviders,
  });
}

/**
 * Bind the whole-image Grype scan to the database snapshot already validated
 * by the embedded-runtime verifier. The caller invokes this only after the
 * embedded verifier has checked schema, calendar/freshness, provider names,
 * provider input digests, and cross-component database identity.
 */
export function verifyBinaryGrypeDatabaseBinding({
  binaryVulnerabilityScan,
  embeddedVulnerabilityScan,
}) {
  const binaryScan = requireRecord(
    binaryVulnerabilityScan,
    "binary Grype vulnerability scan",
  );
  const binaryDescriptor = requireRecord(
    binaryScan.descriptor,
    "binary Grype descriptor",
  );
  const embeddedScan = requireRecord(
    embeddedVulnerabilityScan,
    "embedded runtime vulnerability scan",
  );
  if (!Array.isArray(embeddedScan.components) || embeddedScan.components.length === 0) {
    throw new Error(
      "embedded runtime vulnerability scan must contain database-bound components",
    );
  }
  const firstComponent = requireRecord(
    embeddedScan.components[0],
    "embedded runtime component scan",
  );
  const scannerOutput = requireRecord(
    firstComponent.scanner_output,
    "embedded runtime raw scanner evidence",
  );
  const embeddedDescriptor = requireRecord(
    scannerOutput.descriptor,
    "embedded runtime Grype descriptor",
  );

  const binaryIdentity = normalizedDatabaseIdentity(
    binaryDescriptor.db,
    "binary Grype",
  );
  const embeddedIdentity = normalizedDatabaseIdentity(
    embeddedDescriptor.db,
    "embedded runtime Grype",
  );
  if (binaryIdentity !== embeddedIdentity) {
    throw new Error(
      "binary Grype vulnerability database evidence does not match the validated embedded runtime database snapshot",
    );
  }
}
