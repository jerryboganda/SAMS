// server/src/services/adminQuestionImportService.js
// Business logic for the admin QBank CSV batch-import wizard
// (docs/04_API_SPEC.md §7, docs/07_EXECUTION_PLAN.md Phase 11.4).
//
// ---------------------------------------------------------------------------
// Scope decision (see this file's final report / DECISIONS.md entry)
// ---------------------------------------------------------------------------
// The already-built frontend (client/src/pages/admin/QBankImportPage.tsx)
// parses CSV text CLIENT-SIDE via `FileReader.readAsText` + a hand-rolled
// `.split(",")` parser, then POSTs the already-parsed row OBJECTS as JSON —
// it never sends a raw file or multipart body, and (being text-based) could
// not parse XLSX (a binary zip format) at all even if it wanted to. Per
// CLAUDE.md §1a ("match the already-built frontend's real behavior"), this
// file is built to match that REAL flow exactly: both dryRunImport() and
// commitImport() receive already-parsed JS row objects, never raw CSV/XLSX
// bytes. True server-side XLSX/multipart support would require a nontrivial
// frontend rearchitecture beyond "wire to real API + fix contract drift"
// scope — treated as a documented, deferred limitation, not silently
// half-built.
//
// No CSV-parsing dependency was added for this reason — dryRunImport/
// commitImport never see raw CSV text at all (see above), and
// getImportTemplate() only ever WRITES a CSV string (trivial with plain
// string-joining). See this file's final report for the explicit "why no
// new dependency" note (CLAUDE.md §4: "every new package must be justified
// ... keep dependencies minimal").
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';

const { Subject, BodySystem, Question, QuestionOption, sequelize } = db;

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const CORRECT_OPTION_TOKENS = ['A', 'B', 'C', 'D', '1', '2', '3', '4'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function truncateSnippet(text, len = 60) {
  const s = String(text ?? '').trim();
  if (!s) return '[Empty stem]';
  return s.length > len ? `${s.slice(0, len)}...` : s;
}

/**
 * Snapshots the CURRENT taxonomy into name->row maps (case-insensitive,
 * trimmed) once per dry-run/commit call — every row in the batch is
 * validated against the SAME snapshot, and (for commitImport specifically)
 * against a FRESH snapshot re-read from the database at commit time, never
 * whatever was true at dry-run time (a subject/system could have been
 * renamed or deleted in between). `fallbackSystem` = the first BodySystem
 * row (by sortOrder, then id) — see buildRow()'s systemName handling below
 * for why a fallback exists at all.
 */
async function loadTaxonomySnapshot() {
  const [subjects, systems] = await Promise.all([
    Subject.findAll(),
    BodySystem.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] }),
  ]);
  const subjectMap = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s]));
  const systemMap = new Map(systems.map((s) => [s.name.trim().toLowerCase(), s]));
  return { subjectMap, systemMap, fallbackSystem: systems[0] ?? null };
}

/**
 * Builds a normalized `{optionText, isCorrect}[]` list from EITHER shape a
 * row might arrive in:
 *   - a raw CSV-parsed row (dryRunImport's input): `optionA..optionD` +
 *     `correctOption` (a letter A-D or digit 1-4, case-insensitive) — the
 *     exact shape client/src/pages/admin/QBankImportPage.tsx's hand-rolled
 *     parser produces from the CSV template's header row.
 *   - an already-normalized dry-run-output row (commitImport's input): a
 *     real `options: [{optionText, isCorrect}]` array — the SAME shape
 *     dryRunImport's own `validRows` entries carry, round-tripped unchanged
 *     by the frontend (per the task brief). Re-validating a row in THIS
 *     shape re-checks isCorrect/optionText exactly as given; no A-D/
 *     correctOption re-resolution is needed or possible (that information
 *     no longer exists once collapsed into options[]).
 * Only a shape-level defect that's exclusively detectable from the RAW form
 * (too few non-empty options; an invalid/unresolvable correctOption token)
 * is rejected here — everything else (count >=2, exactly-1-correct,
 * taxonomy, stem length, difficulty) is checked uniformly afterwards by
 * validateRow() on either shape, which is what makes this the ONE shared
 * rule set for both dryRunImport and commitImport (task brief: "reuse the
 * same validation logic ... do not duplicate the rule set").
 */
function buildOptionsList(row) {
  if (Array.isArray(row.options)) {
    return {
      ok: true,
      options: row.options.map((o) => ({ optionText: String(o?.optionText ?? '').trim(), isCorrect: !!o?.isCorrect })),
    };
  }

  const rawByLetter = { A: row.optionA, B: row.optionB, C: row.optionC, D: row.optionD };
  const providedLetters = OPTION_LETTERS.filter((l) => String(rawByLetter[l] ?? '').trim().length > 0);
  if (providedLetters.length < 2) {
    return { ok: false, reason: 'At least 2 options (A & B) are required.' };
  }

  const correctRaw = row.correctOption;
  const correctToken = correctRaw !== undefined && correctRaw !== null ? String(correctRaw).trim().toUpperCase() : '';
  if (!correctToken || !CORRECT_OPTION_TOKENS.includes(correctToken)) {
    return { ok: false, reason: 'Missing or invalid correct answer selection (must be A, B, C, or D).' };
  }
  const correctLetter = /^[1-4]$/.test(correctToken) ? OPTION_LETTERS[Number(correctToken) - 1] : correctToken;
  if (!providedLetters.includes(correctLetter)) {
    return { ok: false, reason: 'The correct answer selection does not point at one of the provided options.' };
  }

  const options = providedLetters.map((letter) => ({
    optionText: String(rawByLetter[letter]).trim(),
    isCorrect: letter === correctLetter,
  }));
  return { ok: true, options };
}

/**
 * The ONE shared validation core, run identically whether `row` is a raw
 * CSV-parsed row (dryRunImport) or an already-normalized dry-run-output row
 * being re-validated from scratch (commitImport — see buildOptionsList's
 * header comment for the shape adapter that makes a single function work
 * for both). Rule order deliberately mirrors
 * client/src/api/endpoints/admin.ts's mock `dryRunCsvImport` branch's own
 * check order (stem -> options -> correctOption -> subjectName) for the
 * first four rules, so this real implementation produces the same pass/fail
 * verdict the mock driver would on the same input; systemName/difficulty
 * checks are appended after (the mock has no equivalent for either).
 *
 * `subjectName` is REQUIRED and must resolve to a real, existing Subject —
 * no auto-create (task brief). `systemName` is OPTIONAL: if provided it
 * must resolve to a real BodySystem the same way; if omitted/blank, the
 * taxonomy snapshot's first BodySystem row is used as a default instead of
 * erroring — `questions.system_id` is NOT NULL at the DB layer (see
 * models/Question.js), so *some* systemId is always required to persist a
 * row, and the shipped CSV template/sample fixtures do not always include a
 * systemName column at all. This "required subject, optional system with a
 * deterministic fallback" split is a judgment call — see this file's final
 * report / DECISIONS.md.
 */
function validateRow(row, snapshot) {
  const stem = String(row?.stem ?? '').trim();
  if (!stem || stem.length < 10) {
    return { ok: false, reason: 'Vignette stem is missing or too short (< 10 characters).' };
  }

  const optionsResult = buildOptionsList(row || {});
  if (!optionsResult.ok) return optionsResult;
  const { options } = optionsResult;
  if (options.length < 2) {
    return { ok: false, reason: 'At least 2 options (A & B) are required.' };
  }
  const correctCount = options.filter((o) => o.isCorrect).length;
  if (correctCount !== 1) {
    return { ok: false, reason: 'Exactly one option must be marked as the correct answer.' };
  }

  const subjectNameRaw = row?.subjectName ? String(row.subjectName).trim() : '';
  const subject = subjectNameRaw ? snapshot.subjectMap.get(subjectNameRaw.toLowerCase()) : null;
  if (!subject) {
    return {
      ok: false,
      reason: subjectNameRaw
        ? `Unknown Subject "${subjectNameRaw}". Must match active taxonomy.`
        : 'subjectName is required and must match active taxonomy.',
    };
  }

  const systemNameRaw = row?.systemName ? String(row.systemName).trim() : '';
  let system = snapshot.fallbackSystem;
  if (systemNameRaw) {
    system = snapshot.systemMap.get(systemNameRaw.toLowerCase()) || null;
    if (!system) {
      return { ok: false, reason: `Unknown System "${systemNameRaw}". Must match active taxonomy.` };
    }
  }
  if (!system) {
    return { ok: false, reason: 'No systemName was provided and no default body system is configured.' };
  }

  const difficultyRaw = row?.difficulty ? String(row.difficulty).trim().toLowerCase() : '';
  let difficulty = 'medium';
  if (difficultyRaw) {
    if (!DIFFICULTIES.includes(difficultyRaw)) {
      return { ok: false, reason: `Invalid difficulty "${row.difficulty}" — must be easy, medium, or hard.` };
    }
    difficulty = difficultyRaw;
  }

  return {
    ok: true,
    row: {
      // The CSV row shape (task brief's confirmed header) carries no
      // examCategory column at all — defaulted to 'NRE1', matching both the
      // mock driver's own fallback (`row.examCategory || "NRE1"`) and this
      // codebase's general "NRE1 is the flagship default" precedent (e.g.
      // tests/helpers/publicFixtures.js#createCourse).
      examCategory: 'NRE1',
      subjectId: subject.id,
      subjectName: subject.name,
      systemId: system.id,
      systemName: system.name,
      stem,
      difficulty,
      // `questions.explanation` is NOT NULL at the DB layer but the CSV
      // template's `explanation` column is not otherwise validated/required
      // by the task brief's rule list — defaulted to '' rather than
      // rejecting the row outright.
      explanation: row?.explanation ? String(row.explanation).trim() : '',
      isActive: true,
      options: options.map((o, idx) => ({ optionText: o.optionText, isCorrect: o.isCorrect, sortOrder: idx })),
    },
  };
}

// ---------------------------------------------------------------------------
// POST /admin/questions/import/dry-run
// ---------------------------------------------------------------------------

/** Pure validation — nothing is written to the database. */
export async function dryRunImport(parsedRows) {
  if (!Array.isArray(parsedRows)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'parsedRows must be an array.');
  }

  const snapshot = await loadTaxonomySnapshot();
  const validRows = [];
  const errorRows = [];

  parsedRows.forEach((raw, idx) => {
    const result = validateRow(raw, snapshot);
    if (result.ok) {
      validRows.push(result.row);
    } else {
      errorRows.push({ rowNumber: idx + 1, snippet: truncateSnippet(raw?.stem), reason: result.reason });
    }
  });

  return { validCount: validRows.length, errorCount: errorRows.length, validRows, errorRows };
}

// ---------------------------------------------------------------------------
// POST /admin/questions/import/commit
// ---------------------------------------------------------------------------

/**
 * Re-validates every row from scratch (same validateRow() core dryRunImport
 * uses — task brief: "never trust that a client-submitted 'already
 * validated' row actually is, the dry-run and commit are two separate,
 * unauthenticated-against-each-other HTTP requests") against a FRESH
 * taxonomy snapshot. A row that now fails (e.g. its subject was deleted
 * between dry-run and commit) is skipped, not thrown — the whole commit
 * never crashes over one stale row; `skippedCount` accumulates how many
 * were dropped. Persists everything still valid as real Question +
 * QuestionOption rows in ONE transaction via an explicit per-question loop
 * (Question.create + QuestionOption.bulkCreate) rather than a single
 * Question.bulkCreate — bulkCreate doesn't reliably hand back generated ids
 * to attach each question's own options to across MySQL/Sequelize, and this
 * only ever runs for an admin-triggered, low-frequency import, not a hot
 * path, so the small per-row overhead is a non-issue.
 */
export async function commitImport(validRows) {
  if (!Array.isArray(validRows)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'validRows must be an array.');
  }

  const snapshot = await loadTaxonomySnapshot();
  const stillValid = [];
  let skippedCount = 0;
  for (const row of validRows) {
    const result = validateRow(row, snapshot);
    if (result.ok) {
      stillValid.push(result.row);
    } else {
      skippedCount += 1;
    }
  }

  let importedCount = 0;
  await sequelize.transaction(async (transaction) => {
    for (const row of stillValid) {
      const question = await Question.create(
        {
          examCategory: row.examCategory,
          subjectId: row.subjectId,
          systemId: row.systemId,
          stem: row.stem,
          explanation: row.explanation,
          difficulty: row.difficulty,
          isActive: true,
        },
        { transaction }
      );
      await QuestionOption.bulkCreate(
        row.options.map((o) => ({ questionId: question.id, optionText: o.optionText, isCorrect: o.isCorrect, sortOrder: o.sortOrder })),
        { transaction }
      );
      importedCount += 1;
    }
  });

  // `skippedCount` is additive to docs/04_API_SPEC.md's documented
  // `{importedCount}` shape — harmless for the already-built frontend
  // (`commitCsvImport` only ever reads `.importedCount`) and useful
  // admin-observability for "some rows silently went stale between dry-run
  // and commit".
  return { importedCount, skippedCount };
}

// ---------------------------------------------------------------------------
// GET /admin/questions/import-template
// ---------------------------------------------------------------------------

/**
 * Built even though the current frontend generates its OWN template
 * client-side and never calls this route — cheap, matches
 * docs/04_API_SPEC.md §7 exactly, same "build the documented-but-not-yet-
 * called endpoint anyway when it's cheap" precedent as Phase 10's
 * GET /announcements. Plain string-joining — no CSV library needed for a
 * fixed 3-line file with no embedded commas/quotes to escape.
 */
export function getImportTemplate() {
  const header = 'stem,optionA,optionB,optionC,optionD,correctOption,subjectName,systemName,difficulty,explanation';
  const example1 =
    'A 45-year-old man presents with sudden onset crushing chest pain radiating to the jaw.,Aspirin,Beta-blocker,Nitroglycerin,Morphine,A,Pharmacology,Cardiovascular System,medium,Aspirin is first-line antiplatelet therapy in suspected ACS.';
  const example2 =
    'A 6-year-old child presents with a barking cough and inspiratory stridor.,Croup,Epiglottitis,Asthma,Bronchiolitis,A,Medicine,Respiratory System,easy,Classic presentation of croup (laryngotracheobronchitis).';
  return `${header}\n${example1}\n${example2}\n`;
}

export default {
  dryRunImport,
  commitImport,
  getImportTemplate,
};
