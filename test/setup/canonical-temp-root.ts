import { canonicalTempRoot } from "../support/canonical-temp-root";

const physicalTempRoot = canonicalTempRoot();
process.env.TMPDIR = physicalTempRoot;
if (process.platform === "win32") {
  process.env.TEMP = physicalTempRoot;
  process.env.TMP = physicalTempRoot;
}
