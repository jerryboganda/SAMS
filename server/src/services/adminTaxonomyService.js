// server/src/services/adminTaxonomyService.js
// Business logic for admin QBank taxonomy (Subjects/Systems) management
// (docs/07_EXECUTION_PLAN.md Phase 11.3). Route paths are the NESTED
// `/admin/taxonomy`, `/admin/taxonomy/subjects[/:id]`,
// `/admin/taxonomy/systems[/:id]` shape — confirmed directly against
// client/src/api/endpoints/admin.ts's real call sites (getTaxonomy() hits
// `/admin/taxonomy`; createSubject/updateSubject/deleteSubject hit
// `/admin/taxonomy/subjects[/:id]`, same pattern for systems) — NOT the flat
// `/admin/subjects`/`/admin/systems` docs/04_API_SPEC.md §7's shorthand
// text implies. Per CLAUDE.md §1a, the already-built frontend's real call
// wins over the spec's shorthand wording.
import { col, fn } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';

const { Subject, BodySystem, Question } = db;

// ---------------------------------------------------------------------------
// Serializers / helpers
// ---------------------------------------------------------------------------

/** Matches client/src/types/index.ts's `Subject`/`BodySystem` interfaces exactly (id, name, sortOrder, questionsCount?). */
function serializeTaxonomyRow(row, countsMap) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    questionsCount: countsMap.get(row.id) || 0,
  };
}

async function nextSortOrder(Model) {
  const max = await Model.max('sortOrder');
  return (Number.isFinite(max) ? max : -1) + 1;
}

function translateUniqueConstraintError(err, label) {
  if (err?.name === 'SequelizeUniqueConstraintError') {
    throw new ApiError(409, 'CONFLICT', `A ${label} with this name already exists.`);
  }
  throw err;
}

// ---------------------------------------------------------------------------
// GET /admin/taxonomy
// ---------------------------------------------------------------------------

/**
 * `questionsCount` per row = `Question.count({where:{subjectId|systemId:
 * item.id}})`, computed via ONE grouped aggregate per taxonomy dimension
 * (not one COUNT query per row — no N+1) — used by the frontend to warn/
 * block deletion of an in-use taxonomy entry, per the `Subject`/`BodySystem`
 * TS type's optional `questionsCount` field. Counts every question
 * regardless of `isActive` (a soft-deleted/inactive question still "uses"
 * its subject/system for the purposes of "can this taxonomy row be safely
 * deleted" — see assertSubjectDeletable/assertSystemDeletable below, which
 * intentionally use the same unfiltered count).
 */
export async function getTaxonomy() {
  const [subjects, systems, subjectCounts, systemCounts] = await Promise.all([
    Subject.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] }),
    BodySystem.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] }),
    Question.findAll({ attributes: ['subjectId', [fn('COUNT', col('id')), 'cnt']], group: ['subjectId'], raw: true }),
    Question.findAll({ attributes: ['systemId', [fn('COUNT', col('id')), 'cnt']], group: ['systemId'], raw: true }),
  ]);

  const bySubject = new Map(subjectCounts.map((r) => [r.subjectId, Number(r.cnt)]));
  const bySystem = new Map(systemCounts.map((r) => [r.systemId, Number(r.cnt)]));

  return {
    subjects: subjects.map((s) => serializeTaxonomyRow(s, bySubject)),
    systems: systems.map((s) => serializeTaxonomyRow(s, bySystem)),
  };
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export async function createSubject(name) {
  let subject;
  try {
    subject = await Subject.create({ name, sortOrder: await nextSortOrder(Subject) });
  } catch (err) {
    translateUniqueConstraintError(err, 'subject');
  }
  return serializeTaxonomyRow(subject, new Map());
}

export async function updateSubject(id, name) {
  const subject = await Subject.findByPk(id);
  if (!subject) {
    throw new ApiError(404, 'NOT_FOUND', 'Subject not found.');
  }
  try {
    await subject.update({ name });
  } catch (err) {
    translateUniqueConstraintError(err, 'subject');
  }
  const questionsCount = await Question.count({ where: { subjectId: id } });
  return serializeTaxonomyRow(subject, new Map([[id, questionsCount]]));
}

/**
 * Guards the delete: a subject referenced by any question (active or not)
 * cannot be removed — mirrors adminCourseService.js's
 * assertCourseDeletable/assertLectureDeletable "guard the delete, don't
 * silently break referential integrity" idiom (same 409 CONFLICT shape).
 * `questions.subject_id` has no documented ON DELETE behavior making this
 * safe automatically, so the app-level guard is the only thing preventing
 * either a raw FK-violation 500 or (if the FK were more permissive) silently
 * orphaning real question rows.
 */
export async function deleteSubject(id) {
  const subject = await Subject.findByPk(id);
  if (!subject) {
    throw new ApiError(404, 'NOT_FOUND', 'Subject not found.');
  }
  const count = await Question.count({ where: { subjectId: id } });
  if (count > 0) {
    throw new ApiError(409, 'CONFLICT', 'Cannot delete a subject that has questions assigned to it.');
  }
  await Subject.destroy({ where: { id } });
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

export async function createSystem(name) {
  let system;
  try {
    system = await BodySystem.create({ name, sortOrder: await nextSortOrder(BodySystem) });
  } catch (err) {
    translateUniqueConstraintError(err, 'system');
  }
  return serializeTaxonomyRow(system, new Map());
}

export async function updateSystem(id, name) {
  const system = await BodySystem.findByPk(id);
  if (!system) {
    throw new ApiError(404, 'NOT_FOUND', 'System not found.');
  }
  try {
    await system.update({ name });
  } catch (err) {
    translateUniqueConstraintError(err, 'system');
  }
  const questionsCount = await Question.count({ where: { systemId: id } });
  return serializeTaxonomyRow(system, new Map([[id, questionsCount]]));
}

/** Symmetric guard for a body system — see deleteSubject's reasoning above. */
export async function deleteSystem(id) {
  const system = await BodySystem.findByPk(id);
  if (!system) {
    throw new ApiError(404, 'NOT_FOUND', 'System not found.');
  }
  const count = await Question.count({ where: { systemId: id } });
  if (count > 0) {
    throw new ApiError(409, 'CONFLICT', 'Cannot delete a body system that has questions assigned to it.');
  }
  await BodySystem.destroy({ where: { id } });
}

export default {
  getTaxonomy,
  createSubject,
  updateSubject,
  deleteSubject,
  createSystem,
  updateSystem,
  deleteSystem,
};
