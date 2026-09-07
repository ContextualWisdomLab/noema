import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT_KEYS = new Set(["name", "main", "compatibility_date"]);
const DURABLE_OBJECT_KEYS = new Set(["name", "class_name"]);
const EXPORT_KEYS = new Set(["type", "storage"]);
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"\\]*)"$/;
const EXPORT_SECTION = /^\[exports\.([A-Za-z_][A-Za-z0-9_]*)\]$/;

function assignUnique(target, key, value, context) {
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    throw new Error(`Duplicate ${context} key: ${key}`);
  }
  target[key] = value;
}

/**
 * Derive the persistent local workerd namespace identity from the binding authority.
 *
 * Workerd uses `uniqueKey` as the durable namespace identity. Binding order and implementation
 * class names may change without intending to replace a namespace, so neither can participate in
 * the key. Renaming the binding is the explicit local namespace replacement boundary.
 */
export function localDurableObjectStorageKey(binding) {
  return `noema-local-${binding.name}`;
}

/**
 * Validate already-provisioned Durable Object bindings without rejecting newly declared exports.
 *
 * A missing binding is allowed because Cloudflare's declarative `exports` reconciliation creates
 * a new namespace during the version upload. If a binding already exists, however, its type and
 * class identity must match exactly so a deployment cannot silently attach Noema to foreign state.
 */
export function validateExistingDurableObjectBindings(config, settings) {
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
  const current = new Map(bindings.map((binding) => [binding?.name, binding]));

  for (const durableObject of config.durableObjects) {
    const binding = current.get(durableObject.name);
    if (binding === undefined) continue;
    if (
      binding?.type !== "durable_object_namespace"
      || binding?.class_name !== durableObject.class_name
    ) {
      throw new Error(`Existing Durable Object binding does not match ${durableObject.name}`);
    }
  }
  return current;
}

/**
 * Read the narrow Worker configuration surface that Noema owns.
 *
 * The parser is intentionally fail-closed instead of implementing general TOML. It accepts
 * only the root identity, Durable Object bindings/exports, and plain-text vars currently used
 * by Noema. Any new configuration shape must receive an explicit adapter decision rather than
 * being silently omitted from direct Cloudflare API uploads or local workerd development.
 */
export async function readNoemaWorkerConfig(repositoryRoot) {
  const source = await readFile(join(repositoryRoot, "wrangler.toml"), "utf8");
  const root = {};
  const durableObjects = [];
  const exportsByClass = new Map();
  const vars = {};
  let section = "root";
  let currentDurableObject = null;
  let currentExport = null;

  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line === "[[durable_objects.bindings]]") {
      currentDurableObject = {};
      durableObjects.push(currentDurableObject);
      currentExport = null;
      section = "durable-object";
      continue;
    }
    if (line === "[vars]") {
      currentDurableObject = null;
      currentExport = null;
      section = "vars";
      continue;
    }
    const exportMatch = EXPORT_SECTION.exec(line);
    if (exportMatch) {
      const className = exportMatch[1];
      if (exportsByClass.has(className)) {
        throw new Error(`Duplicate Worker export section: ${className}`);
      }
      currentExport = {};
      exportsByClass.set(className, currentExport);
      currentDurableObject = null;
      section = "export";
      continue;
    }
    if (line.startsWith("[") || line.startsWith("[[")) {
      throw new Error(`Unsupported Worker configuration section at line ${index + 1}: ${line}`);
    }

    const assignment = ASSIGNMENT.exec(line);
    if (!assignment) {
      throw new Error(`Unsupported Worker configuration syntax at line ${index + 1}`);
    }
    const [, key, value] = assignment;

    if (section === "root") {
      if (!ROOT_KEYS.has(key)) throw new Error(`Unsupported root Worker key: ${key}`);
      assignUnique(root, key, value, "root Worker");
      continue;
    }
    if (section === "durable-object") {
      if (!currentDurableObject || !DURABLE_OBJECT_KEYS.has(key)) {
        throw new Error(`Unsupported Durable Object binding key: ${key}`);
      }
      assignUnique(currentDurableObject, key, value, "Durable Object binding");
      continue;
    }
    if (section === "export") {
      if (!currentExport || !EXPORT_KEYS.has(key)) {
        throw new Error(`Unsupported Worker export key: ${key}`);
      }
      assignUnique(currentExport, key, value, "Worker export");
      continue;
    }
    assignUnique(vars, key, value, "Worker var");
  }

  for (const required of ROOT_KEYS) {
    if (!root[required]) throw new Error(`Missing required Worker key: ${required}`);
  }
  if (durableObjects.length === 0) throw new Error("No Durable Object bindings configured");

  for (const binding of durableObjects) {
    if (!binding.name || !binding.class_name) {
      throw new Error("Durable Object bindings require name and class_name");
    }
    const exported = exportsByClass.get(binding.class_name);
    if (!exported || exported.type !== "durable-object" || exported.storage !== "sqlite") {
      throw new Error(`Durable Object export ${binding.class_name} must remain durable-object/sqlite`);
    }
  }
  if (exportsByClass.size !== durableObjects.length) {
    throw new Error("Every Worker export must correspond to exactly one Durable Object binding");
  }

  const exports = Object.fromEntries(
    [...exportsByClass.entries()].map(([className, exported]) => [
      className,
      Object.freeze({ ...exported }),
    ]),
  );

  return Object.freeze({
    name: root.name,
    main: root.main,
    compatibilityDate: root.compatibility_date,
    durableObjects: durableObjects.map((binding) => Object.freeze({ ...binding })),
    exports: Object.freeze(exports),
    vars: Object.freeze({ ...vars }),
  });
}
