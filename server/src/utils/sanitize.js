// server/src/utils/sanitize.js
// Shared write-time HTML sanitization for every freeform text field an admin
// (or an anonymous public visitor, for the contact form) submits and that is
// later rendered somewhere in the app (docs/07_EXECUTION_PLAN.md Phase 12.2;
// docs/10_SECURITY_CHECKLIST.md §G: "Rich text sanitized on write (whitelist)
// + escaped on render; stored-XSS test passes").
//
// Two functions, both built on `sanitize-html` (the standard, well-maintained
// choice for this in the Node ecosystem — see DECISIONS.md for the
// package-addition justification):
//
//   - sanitizeRichText(input): a MINIMAL whitelist for admin-authored
//     longer-form content (question explanations, announcement bodies,
//     course/lecture descriptions, faculty bios, FAQ answers) — allows only
//     basic inline/block formatting tags and NOTHING else. No attributes on
//     any tag (in particular no `href`/`src`/`style`/`on*`), so there is no
//     way to smuggle a `javascript:` URL or an event-handler attribute
//     through even an allowed tag.
//   - sanitizePlainText(input): strips ALL tags/attributes — for fields that
//     must never contain any markup at all (question stems, titles, names,
//     option text, subjects/etc.).
//
// Both are null/undefined-safe: only a non-empty string is ever passed to
// sanitize-html; anything else (null, undefined, number, empty string) is
// returned unchanged so callers can keep writing `field ?? null` /
// `field?.trim()` patterns upstream without extra guards. Neither function
// throws — sanitize-html itself does not throw for malformed HTML input (it
// treats unparseable fragments as text), and the type guard here means it's
// never even invoked on a non-string.
import sanitizeHtml from 'sanitize-html';

/** Basic formatting tags only, no attributes at all — see file header. */
const RICH_TEXT_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * sanitize-html serializes surviving TEXT nodes as valid HTML — i.e. it
 * HTML-entity-encodes bare `&`, `<`, `>` characters (e.g. "R&D" ->
 * "R&amp;D"). That's the correct default for output that will be re-parsed
 * as HTML, but this codebase's only render path for these fields is React
 * JSX text interpolation (`{value}`) — confirmed by grepping the ENTIRE
 * client/src tree for `dangerouslySetInnerHTML`: zero matches, nowhere is
 * admin/user content rendered as raw HTML. React already escapes `{value}`
 * for safe DOM insertion on its own (docs/10_SECURITY_CHECKLIST.md §G's
 * "escaped on render" half), so an *upstream* HTML-entity-encoding here would
 * just show up as a literal, un-decoded "&amp;" on screen — verified against
 * this repo's own seed data, which contains real admin-authored strings like
 * "Orientation & How to Use the QBank" and "Terms & Conditions" (see
 * src/db/seeders/20260101010002-seed-03-course.cjs,
 * .../20260101010008-seed-09-settings.cjs) that a naive sanitizer would
 * silently corrupt on the next edit-and-resave.
 *
 * This `textFilter` decodes exactly the 3 entities sanitize-html's serializer
 * can produce for a bare (non-attribute) text node — `&amp;`/`&lt;`/`&gt;` —
 * back to their literal characters, so the stored value matches what was
 * typed. This is safe to do *after* sanitize-html has already finished
 * classifying the input as tags vs. text and stripping every disallowed tag:
 * by the time a string reaches `textFilter`, it has already been determined
 * to be inert text content (anything that WAS a real, parseable tag — e.g. an
 * actual `<script>` element — was consumed and removed as an element, not
 * routed through this text-encoding path at all; see
 * tests/security/sanitization.test.js's payload-fixture tests, which assert
 * this directly). Un-escaping `&lt;`/`&gt;` back to `<`/`>` in that
 * already-tag-free text therefore cannot reintroduce a tag — there is no
 * second HTML-parsing pass over the stored value anywhere in this app.
 */
function decodeBareTextEntities(text) {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Sanitizes admin-authored longer-form content down to a minimal formatting
 * whitelist (`b`/`i`/`em`/`strong`/`p`/`br`/`ul`/`ol`/`li`), stripping every
 * other tag (e.g. `<script>`, `<img>`, `<a>`) and every attribute (so no
 * `onerror=`/`onclick=`/`href="javascript:"` can ride along on an otherwise
 * allowed tag). `<br>` is a self-closing void tag; sanitize-html handles it
 * without needing special-casing.
 */
export function sanitizeRichText(input) {
  if (!isNonEmptyString(input)) return input;
  return sanitizeHtml(input, {
    allowedTags: RICH_TEXT_ALLOWED_TAGS,
    allowedAttributes: {},
    // Belt-and-braces: even though `a`/`img` aren't in allowedTags at all
    // (so their `href`/`src` attributes are already dropped), explicitly
    // disallow every URL-bearing scheme sanitize-html would otherwise permit
    // if this whitelist is ever loosened later.
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
    textFilter: decodeBareTextEntities,
  });
}

/**
 * Strips ALL tags and attributes, reducing the input to plain text — for
 * fields that must never contain any markup (question stems, titles, names,
 * option text). This also neutralizes any embedded `<script>`/`<img
 * onerror>` payload: sanitize-html discards the tag (and, for `<script>`
 * specifically, its inner text too — script is one of sanitize-html's
 * default `nonTextTags`) entirely, leaving only genuine surrounding text.
 */
export function sanitizePlainText(input) {
  if (!isNonEmptyString(input)) return input;
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    textFilter: decodeBareTextEntities,
  });
}

export default { sanitizeRichText, sanitizePlainText };
