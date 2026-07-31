// server/tests/helpers/leakScan.js
// Recursive "no forbidden key anywhere in this JSON body" scanner — used by
// the Phase 7.3 answer-secrecy deep-scan tests (docs/10_SECURITY_CHECKLIST.md
// §E). Walks the ALREADY-PARSED response body (supertest's `res.body`, i.e.
// exactly what came back over the wire after JSON.stringify dropped any
// `undefined`-valued keys server-side) — so this finds a real leak, not just
// a falsy/null placeholder.
export function findForbiddenKeys(value, forbiddenKeys, path = '$') {
  const hits = [];
  function walk(node, currentPath) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, `${currentPath}[${idx}]`));
      return;
    }
    if (typeof node === 'object') {
      for (const [key, val] of Object.entries(node)) {
        if (forbiddenKeys.includes(key)) {
          hits.push(`${currentPath}.${key}`);
        }
        walk(val, `${currentPath}.${key}`);
      }
    }
  }
  walk(value, path);
  return hits;
}

export default findForbiddenKeys;
