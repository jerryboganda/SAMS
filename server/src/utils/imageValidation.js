// server/src/utils/imageValidation.js
// Magic-byte (file-signature) sniffing for uploaded images. The client-
// declared `mimetype` (multer's `file.mimetype`, sourced straight from the
// request's Content-Type header) and the original filename/extension are
// both attacker-controlled and MUST NOT be trusted alone — a renamed `.exe`
// can claim `Content-Type: image/png` and a `.png` extension just as easily
// as a real PNG can. docs/10_SECURITY_CHECKLIST.md §G requires "mime +
// magic-byte check"; this inspects the actual leading bytes of the uploaded
// content and only trusts what they say. No extra dependency (e.g.
// `file-type`) — the handful of signatures this project needs (jpeg/png/
// gif/webp) are simple, stable, and cheap to hardcode.
const FIXED_SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // "GIF8" covers both GIF87a and GIF89a variants.
  { mime: 'image/gif', ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

function matchesFixedSignature(buffer, signatureBytes) {
  if (buffer.length < signatureBytes.length) return false;
  return signatureBytes.every((byte, i) => buffer[i] === byte);
}

// WEBP is a RIFF container: bytes 0-3 "RIFF", bytes 8-11 "WEBP" (bytes 4-7
// are a little-endian file-size field, irrelevant to the type check).
function isWebp(buffer) {
  return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}

/**
 * Sniffs `buffer`'s real file type from its magic bytes only. Returns
 * `{mime, ext}` for a recognized image format, or `null` if the content
 * isn't one of the allowed image types — regardless of what the upload's
 * declared Content-Type or filename extension claimed.
 */
export function sniffImageType(buffer) {
  for (const sig of FIXED_SIGNATURES) {
    if (matchesFixedSignature(buffer, sig.bytes)) return { mime: sig.mime, ext: sig.ext };
  }
  if (isWebp(buffer)) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export default sniffImageType;
