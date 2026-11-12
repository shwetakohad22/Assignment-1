// Spec ID and version extraction from spec.md (FR-20, FR-23, FR-42).

const ID_RE = /\b(FR|AC|INV|BP|GR)-\d{2}[a-h]?\b/g;
const VERSION_RE = /^\*\*Spec Version\*\*: (\d+\.\d+)/m;

export function extractSpecIds(specText) {
  return new Set(String(specText).match(ID_RE) ?? []);
}

export function extractSpecVersion(specText) {
  const m = VERSION_RE.exec(String(specText));
  return m ? m[1] : null;
}
