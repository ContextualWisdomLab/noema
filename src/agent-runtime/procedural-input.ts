const proceduralErrors = new WeakSet<object>();

/** Internal value readers shared only by the Agent Runtime procedural aggregate. */
export class ProceduralGraphError extends Error {
  constructor(code: string) { super(code); this.name = "ProceduralGraphError"; proceduralErrors.add(this); }
}

export function rejectProceduralInput(code: string): never { throw new ProceduralGraphError(code); }

export function normalizeProceduralError(error: unknown): never {
  // WeakSet membership does not invoke a thrown object's proxy/prototype traps.
  if (proceduralErrors.has(error as object)) throw error;
  throw new ProceduralGraphError("unreadable_input");
}

// Capture own data descriptors once: accessors are not allowed to manufacture different
// scope/evidence identities between validation and use. Never echo untrusted values in errors.
export function readProceduralRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) rejectProceduralInput("invalid_record");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) rejectProceduralInput("invalid_record");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => typeof key !== "string" || !keys.includes(key))) rejectProceduralInput("invalid_record");
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value")) rejectProceduralInput("invalid_record");
    result[key] = descriptor.value;
  }
  return result;
}

export function readProceduralArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value)) rejectProceduralInput("invalid_array");
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const length = descriptors.length.value as number;
  if (length < minimum || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1) rejectProceduralInput("invalid_array");
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const descriptor = descriptors[String(i)];
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) rejectProceduralInput("invalid_array");
    result.push(descriptor.value);
  }
  return result;
}

export function proceduralIdentity(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) rejectProceduralInput("invalid_identity");
  return value;
}

export function proceduralDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) rejectProceduralInput("invalid_digest");
  return value;
}

export function proceduralInteger(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) rejectProceduralInput("invalid_integer");
  return value;
}

export function proceduralText(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || value.includes("\0")) rejectProceduralInput("invalid_text");
  return value;
}

export async function proceduralHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > 1_048_576) rejectProceduralInput("graph_budget_exceeded");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
