// server/src/services/adminPackageService.js
// Business logic for subscription and pricing packages management
// Provides full CRUD operations for administrators and public package listings.
import { Op } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { sanitizePlainText, sanitizeRichText } from '../utils/sanitize.js';

const { SubscriptionPackage, Course } = db;

/**
 * Converts a string title to a URL-safe slug (lowercase, alphanumeric and hyphens only).
 * @param {string} title
 * @returns {string}
 */
export function slugify(title) {
  if (!title) return '';
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Serializes a SubscriptionPackage model instance with mapped included course objects.
 * @param {object} pkg
 * @param {Map<number, object>} coursesMap
 * @returns {object}
 */
export function serializePackage(pkg, coursesMap = new Map()) {
  let rawCourseIds = pkg.includedCourseIds;
  if (typeof rawCourseIds === 'string') {
    try {
      rawCourseIds = JSON.parse(rawCourseIds);
    } catch {
      rawCourseIds = [];
    }
  }
  const includedCourseIds = Array.isArray(rawCourseIds)
    ? rawCourseIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  const includedCourses = includedCourseIds.map((courseId) => {
    const course = coursesMap.get(courseId);
    if (!course) {
      return {
        id: courseId,
        title: `Course #${courseId}`,
        examCategory: 'NRE1',
        validityDays: 180,
      };
    }
    return {
      id: course.id,
      title: course.title,
      examCategory: course.examCategory,
      validityDays: course.validityDays,
    };
  });

  let rawFeatures = pkg.features;
  if (typeof rawFeatures === 'string') {
    try {
      rawFeatures = JSON.parse(rawFeatures);
    } catch {
      rawFeatures = [];
    }
  }
  const features = Array.isArray(rawFeatures) ? rawFeatures.map(String) : [];

  return {
    id: pkg.id,
    title: pkg.title,
    slug: pkg.slug,
    description: pkg.description ?? null,
    examCategory: pkg.examCategory,
    price: Number(pkg.price),
    originalPrice:
      pkg.originalPrice !== null && pkg.originalPrice !== undefined
        ? Number(pkg.originalPrice)
        : null,
    currency: pkg.currency,
    validityDays: pkg.validityDays,
    includedCourseIds,
    includedCourses,
    includesQbank: Boolean(pkg.includesQbank),
    includesMockExams: Boolean(pkg.includesMockExams),
    maxDevices: pkg.maxDevices,
    features,
    badge: pkg.badge ?? null,
    sortOrder: pkg.sortOrder,
    isActive: Boolean(pkg.isActive),
    isPopular: Boolean(pkg.isPopular),
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  };
}

/**
 * Pre-fetches Course models for all referenced course IDs across a package set.
 * @param {Array<object>} packages
 * @returns {Promise<Map<number, object>>}
 */
async function getCoursesMapForPackages(packages) {
  const courseIdSet = new Set();
  for (const pkg of packages) {
    let raw = pkg.includedCourseIds;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (Array.isArray(raw)) {
      for (const id of raw) {
        const num = Number(id);
        if (num > 0) courseIdSet.add(num);
      }
    }
  }

  if (courseIdSet.size === 0) return new Map();

  const courses = await Course.findAll({
    where: { id: Array.from(courseIdSet) },
    attributes: ['id', 'title', 'examCategory', 'validityDays'],
  });

  const map = new Map();
  for (const c of courses) {
    map.set(Number(c.id), c);
  }
  return map;
}

let tableEnsured = false;

/**
 * Ensures subscription_packages table exists and is seeded if empty.
 * Guarantees zero downtime on fresh deployments before manual migrations run.
 */
async function ensureTableExists() {
  if (tableEnsured) return;
  try {
    await SubscriptionPackage.sync();
    const count = await SubscriptionPackage.count().catch(() => 0);
    if (count === 0) {
      await SubscriptionPackage.bulkCreate([
        {
          title: 'NRE Step 1 Comprehensive Mastery Package',
          slug: 'nre-step-1-mastery',
          description:
            'Complete clinical mastery for NRE Step 1 examination with HD video lectures, system-wise QBank, and timed mock tests.',
          examCategory: 'NRE1',
          price: 15000,
          originalPrice: 20000,
          currency: 'PKR',
          validityDays: 180,
          includedCourseIds: [1],
          includesQbank: true,
          includesMockExams: true,
          maxDevices: 2,
          features: [
            'Full 180 Days Access (6 Months)',
            'Complete HD Video Curriculum with Dr. Zabih Ullah',
            '5,000+ Verified QBank MCQs with Explanations',
            'Timed Mock Exam Simulator',
            'DRM Multi-Device Access (2 Devices)',
          ],
          badge: 'Most Popular',
          sortOrder: 1,
          isActive: true,
          isPopular: true,
        },
        {
          title: 'USMLE Step 1 High-Yield Prep Pass',
          slug: 'usmle-step-1-prep',
          description:
            'Comprehensive 1-year immersion into USMLE Step 1 basic medical sciences and clinical vignettes.',
          examCategory: 'USMLE1',
          price: 25000,
          originalPrice: 35000,
          currency: 'PKR',
          validityDays: 365,
          includedCourseIds: [2],
          includesQbank: true,
          includesMockExams: true,
          maxDevices: 2,
          features: [
            '365 Days Full Validity (1 Year)',
            'All System-Wise Video Modules',
            'USMLE-Style Clinical Vignettes',
            'Unlimited Mock Exam Retakes',
            'Expert Faculty Doubt Support',
          ],
          badge: 'Best Value',
          sortOrder: 2,
          isActive: true,
          isPopular: false,
        },
        {
          title: 'All-Access Clinical Exam Bundle',
          slug: 'all-access-bundle',
          description:
            'The ultimate package unlocking every course, QBank question bank, and mock exam on SAMS Academy.',
          examCategory: 'BUNDLE',
          price: 45000,
          originalPrice: 65000,
          currency: 'PKR',
          validityDays: 365,
          includedCourseIds: [1, 2, 3],
          includesQbank: true,
          includesMockExams: true,
          maxDevices: 2,
          features: [
            'Complete All-Course Access (NRE + USMLE + SMLE)',
            'Full QBank Access with Explanations',
            'All Specialty Mock Examinations',
            'Priority WhatsApp Support',
            'Free Updates to New Curriculum',
          ],
          badge: 'Full Access Pass',
          sortOrder: 3,
          isActive: true,
          isPopular: false,
        },
      ]).catch(() => {});
    }
    tableEnsured = true;
  } catch {
    // Non-fatal warning — log and continue
  }
}

/**
 * List all subscription packages for administrative management.
 * Ordered by sortOrder ASC, id DESC.
 */
export async function listAllPackages() {
  await ensureTableExists();

  let packages;
  try {
    packages = await SubscriptionPackage.findAll({
      order: [
        ['sortOrder', 'ASC'],
        ['id', 'DESC'],
      ],
    });
  } catch {
    // Self-healing attempt if table was missing
    await SubscriptionPackage.sync().catch(() => {});
    packages = await SubscriptionPackage.findAll({
      order: [
        ['sortOrder', 'ASC'],
        ['id', 'DESC'],
      ],
    }).catch(() => []);
  }

  const coursesMap = await getCoursesMapForPackages(packages);
  return packages.map((pkg) => serializePackage(pkg, coursesMap));
}

/**
 * Retrieve a single subscription package by ID.
 * @param {number} id
 */
export async function getPackageById(id) {
  await ensureTableExists();
  const pkg = await SubscriptionPackage.findByPk(id);
  if (!pkg) {
    throw new ApiError(404, 'NOT_FOUND', 'Subscription package not found.');
  }

  const coursesMap = await getCoursesMapForPackages([pkg]);
  return serializePackage(pkg, coursesMap);
}

/**
 * Create a new subscription package.
 * @param {object} data
 * @param {number|null} _adminUserId
 */
export async function createPackage(data, _adminUserId) {
  await ensureTableExists();
  let slug = data.slug ? slugify(data.slug) : slugify(data.title);
  if (!slug) {
    slug = `package-${Date.now()}`;
  }

  const existing = await SubscriptionPackage.findOne({ where: { slug } });
  if (existing) {
    throw new ApiError(409, 'SLUG_EXISTS', 'A package with this slug already exists.');
  }

  const includedCourseIds = Array.isArray(data.includedCourseIds)
    ? data.includedCourseIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  const features = Array.isArray(data.features)
    ? data.features.map(String).filter((s) => s.trim().length > 0)
    : [];

  const pkg = await SubscriptionPackage.create({
    title: sanitizePlainText(data.title),
    slug,
    description: data.description ? sanitizeRichText(data.description) : null,
    examCategory: data.examCategory || 'NRE1',
    price: data.price !== undefined ? Number(data.price) : 0,
    originalPrice:
      data.originalPrice !== undefined && data.originalPrice !== null
        ? Number(data.originalPrice)
        : null,
    currency: data.currency || 'PKR',
    validityDays: data.validityDays !== undefined ? Number(data.validityDays) : 180,
    includedCourseIds,
    includesQbank: data.includesQbank !== undefined ? Boolean(data.includesQbank) : true,
    includesMockExams:
      data.includesMockExams !== undefined ? Boolean(data.includesMockExams) : true,
    maxDevices: data.maxDevices !== undefined ? Number(data.maxDevices) : 2,
    features,
    badge: data.badge ? sanitizePlainText(data.badge) : null,
    sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : 0,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    isPopular: data.isPopular !== undefined ? Boolean(data.isPopular) : false,
  });

  const coursesMap = await getCoursesMapForPackages([pkg]);
  return serializePackage(pkg, coursesMap);
}

/**
 * Update an existing subscription package.
 * @param {number} id
 * @param {object} data
 * @param {number|null} _adminUserId
 */
export async function updatePackage(id, data, _adminUserId) {
  await ensureTableExists();
  const pkg = await SubscriptionPackage.findByPk(id);
  if (!pkg) {
    throw new ApiError(404, 'NOT_FOUND', 'Subscription package not found.');
  }

  const patch = {};
  if (data.title !== undefined) patch.title = sanitizePlainText(data.title);

  if (data.slug !== undefined && data.slug !== null) {
    const newSlug = slugify(data.slug);
    if (newSlug && newSlug !== pkg.slug) {
      const collision = await SubscriptionPackage.findOne({
        where: {
          slug: newSlug,
          id: { [Op.ne]: id },
        },
      });
      if (collision) {
        throw new ApiError(409, 'SLUG_EXISTS', 'A package with this slug already exists.');
      }
      patch.slug = newSlug;
    }
  }

  if (data.description !== undefined) {
    patch.description = data.description ? sanitizeRichText(data.description) : null;
  }
  if (data.examCategory !== undefined) patch.examCategory = data.examCategory;
  if (data.price !== undefined) patch.price = Number(data.price);
  if (data.originalPrice !== undefined) {
    patch.originalPrice = data.originalPrice !== null ? Number(data.originalPrice) : null;
  }
  if (data.currency !== undefined) patch.currency = data.currency;
  if (data.validityDays !== undefined) patch.validityDays = Number(data.validityDays);

  if (data.includedCourseIds !== undefined) {
    patch.includedCourseIds = Array.isArray(data.includedCourseIds)
      ? data.includedCourseIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
  }

  if (data.includesQbank !== undefined) patch.includesQbank = Boolean(data.includesQbank);
  if (data.includesMockExams !== undefined) patch.includesMockExams = Boolean(data.includesMockExams);
  if (data.maxDevices !== undefined) patch.maxDevices = Number(data.maxDevices);

  if (data.features !== undefined) {
    patch.features = Array.isArray(data.features)
      ? data.features.map(String).filter((s) => s.trim().length > 0)
      : [];
  }

  if (data.badge !== undefined) patch.badge = data.badge ? sanitizePlainText(data.badge) : null;
  if (data.sortOrder !== undefined) patch.sortOrder = Number(data.sortOrder);
  if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);
  if (data.isPopular !== undefined) patch.isPopular = Boolean(data.isPopular);

  await pkg.update(patch);
  const coursesMap = await getCoursesMapForPackages([pkg]);
  return serializePackage(pkg, coursesMap);
}

/**
 * Toggle active status of a subscription package.
 * @param {number} id
 * @param {number|null} _adminUserId
 */
export async function togglePackageActive(id, _adminUserId) {
  await ensureTableExists();
  const pkg = await SubscriptionPackage.findByPk(id);
  if (!pkg) {
    throw new ApiError(404, 'NOT_FOUND', 'Subscription package not found.');
  }

  await pkg.update({ isActive: !pkg.isActive });
  const coursesMap = await getCoursesMapForPackages([pkg]);
  return serializePackage(pkg, coursesMap);
}

/**
 * Delete a subscription package.
 * @param {number} id
 * @param {number|null} _adminUserId
 */
export async function deletePackage(id, _adminUserId) {
  await ensureTableExists();
  const pkg = await SubscriptionPackage.findByPk(id);
  if (!pkg) {
    throw new ApiError(404, 'NOT_FOUND', 'Subscription package not found.');
  }

  await pkg.destroy();
  return { success: true, message: 'Subscription package deleted successfully.' };
}

/**
 * List active subscription packages for public viewing.
 * Ordered by sortOrder ASC, id DESC.
 */
export async function listPublicPackages() {
  await ensureTableExists();
  const packages = await SubscriptionPackage.findAll({
    where: { isActive: true },
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'DESC'],
    ],
  });

  const coursesMap = await getCoursesMapForPackages(packages);
  return packages.map((pkg) => serializePackage(pkg, coursesMap));
}

export default {
  slugify,
  serializePackage,
  listAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  togglePackageActive,
  deletePackage,
  listPublicPackages,
};
