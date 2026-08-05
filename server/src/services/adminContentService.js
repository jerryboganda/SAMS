// server/src/services/adminContentService.js
// Business logic for the "simpler, standalone" admin content endpoints
// (docs/04_API_SPEC.md §7 "Comms/Site"): faculty, FAQs, contact messages.
// Mirrors services/publicService.js's read-only serializers but exposes
// every row (including inactive ones admins still need to manage).
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { assertExactIdSet } from '../utils/reorder.js';
import { sanitizePlainText, sanitizeRichText } from '../utils/sanitize.js';

const { Faculty, Faq, ContactMessage, sequelize } = db;

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeFaculty(row) {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    bio: row.bio,
    photoUrl: row.photoUrl,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function serializeFaq(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function serializeContactMessage(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
  };
}

async function nextSortOrder(Model) {
  const max = await Model.max('sortOrder');
  return (Number.isFinite(max) ? max : -1) + 1;
}

// ---------------------------------------------------------------------------
// Faculty
// ---------------------------------------------------------------------------

export async function listFaculty() {
  const rows = await Faculty.findAll({
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  return rows.map(serializeFaculty);
}

// `name`/`title` are plain-text-only; `bio` is longer-form admin-authored
// prose that may reasonably want basic formatting (docs/10_SECURITY_CHECKLIST.md
// §G).
export async function createFaculty(data) {
  const row = await Faculty.create({
    name: sanitizePlainText(data.name),
    title: sanitizePlainText(data.title) ?? null,
    bio: sanitizeRichText(data.bio) ?? null,
    photoUrl: data.photoUrl ?? null,
    sortOrder: data.sortOrder ?? (await nextSortOrder(Faculty)),
    isActive: data.isActive ?? true,
  });
  return serializeFaculty(row);
}

const FACULTY_SANITIZERS = { name: sanitizePlainText, title: sanitizePlainText, bio: sanitizeRichText };

export async function updateFaculty(id, data) {
  const row = await Faculty.findByPk(id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Faculty member not found.');
  const patch = {};
  for (const key of ['name', 'title', 'bio', 'photoUrl', 'sortOrder', 'isActive']) {
    if (data[key] === undefined) continue;
    const sanitizer = FACULTY_SANITIZERS[key];
    patch[key] = sanitizer ? sanitizer(data[key]) : data[key];
  }
  await row.update(patch);
  return serializeFaculty(row);
}

export async function deleteFaculty(id) {
  const row = await Faculty.findByPk(id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Faculty member not found.');
  await row.destroy();
}

export async function reorderFaculty(items) {
  const existing = await Faculty.findAll({ attributes: ['id'] });
  assertExactIdSet(
    existing.map((r) => r.id),
    items.map((i) => i.id)
  );
  await sequelize.transaction(async (transaction) => {
    await Promise.all(
      items.map((item) => Faculty.update({ sortOrder: item.sortOrder }, { where: { id: item.id }, transaction }))
    );
  });
  return listFaculty();
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export async function listFaqs() {
  const rows = await Faq.findAll({
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  return rows.map(serializeFaq);
}

// `question` is plain-text-only; `answer` is longer-form admin-authored
// prose that may reasonably want basic formatting (docs/10_SECURITY_CHECKLIST.md
// §G).
export async function createFaq(data) {
  const row = await Faq.create({
    question: sanitizePlainText(data.question),
    answer: sanitizeRichText(data.answer),
    sortOrder: data.sortOrder ?? (await nextSortOrder(Faq)),
    isActive: data.isActive ?? true,
  });
  return serializeFaq(row);
}

const FAQ_SANITIZERS = { question: sanitizePlainText, answer: sanitizeRichText };

export async function updateFaq(id, data) {
  const row = await Faq.findByPk(id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'FAQ item not found.');
  const patch = {};
  for (const key of ['question', 'answer', 'sortOrder', 'isActive']) {
    if (data[key] === undefined) continue;
    const sanitizer = FAQ_SANITIZERS[key];
    patch[key] = sanitizer ? sanitizer(data[key]) : data[key];
  }
  await row.update(patch);
  return serializeFaq(row);
}

export async function deleteFaq(id) {
  const row = await Faq.findByPk(id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'FAQ item not found.');
  await row.destroy();
}

export async function reorderFaqs(items) {
  const existing = await Faq.findAll({ attributes: ['id'] });
  assertExactIdSet(
    existing.map((r) => r.id),
    items.map((i) => i.id)
  );
  await sequelize.transaction(async (transaction) => {
    await Promise.all(items.map((item) => Faq.update({ sortOrder: item.sortOrder }, { where: { id: item.id }, transaction })));
  });
  return listFaqs();
}

// ---------------------------------------------------------------------------
// Contact messages
// ---------------------------------------------------------------------------

export async function listContactMessages({ status } = {}) {
  const where = {};
  if (status) where.status = status;
  const rows = await ContactMessage.findAll({ where, order: [['id', 'DESC']] });
  return rows.map(serializeContactMessage);
}

export async function updateContactMessageStatus(id, status) {
  const row = await ContactMessage.findByPk(id);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Contact message not found.');
  await row.update({ status });
  return serializeContactMessage(row);
}
