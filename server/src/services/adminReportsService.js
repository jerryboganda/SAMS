// server/src/services/adminReportsService.js
// GET /admin/reports (docs/07_EXECUTION_PLAN.md 11.5, "reports" half).
// Layering: routes -> controllers -> services -> models (CLAUDE.md §4).
//
// CONTRACT-DRIFT NOTE (documented per CLAUDE.md §1a, see this task's final
// report for the DECISIONS.md entry to log): docs/04_API_SPEC.md §7's
// literal text describes three separate report endpoints
// (`/admin/reports/revenue`, `/admin/reports/enrollments`,
// `/admin/reports/question-difficulty`). The ACTUAL shipped frontend
// (client/src/api/endpoints/admin.ts#getReportsData,
// client/src/pages/admin/AnalyticsManagementPage.tsx) calls exactly ONE
// combined endpoint, `GET /admin/reports`, with no query params, and expects
// ONE combined JSON object back. Per CLAUDE.md §1a ("match the frontend's
// actual real call, not the spec shorthand"), this file implements that one
// combined endpoint instead of three separate ones.
//
// Response shape matched field-for-field to AnalyticsManagementPage.tsx's
// actual dereferences + admin.ts's USE_MOCK fixture (there is no dedicated
// TS interface — `getReportsData()` returns untyped `any`, per that file).
//
// For every grouped-aggregate query below (topSubjectsAttempted, topStudents,
// enrollmentsByCourse), follows services/analyticsService.js's established
// `computeGroupPerformance` pattern: a single grouped query via
// Sequelize `fn()`/`col()`/`group`, never an N+1 loop. Per that file's own
// empirically-documented gotcha (reused here, not re-verified from scratch
// beyond this file's own test suite): `col()` entries reference the
// PHYSICAL (already-underscored) column name, e.g. `'question.subject_id'`,
// never the camelCase JS attribute name — `col()` bypasses Sequelize's
// underscored-mapping, unlike plain where/bare-string attributes/group
// entries.
import { Op, fn, col, literal } from 'sequelize';
import db from '../models/index.js';

const { Order, Course, Enrollment, TestSession, TestAttemptQuestion, Question, Subject, User, UserDailyStat } = db;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function utcDateOnly(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function yearMonthKey(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// revenueByMonth
// ---------------------------------------------------------------------------

// Task brief: "last 7-12 calendar months" — a range, not an exact count.
// Judgment call: 12 (a full rolling calendar year), the same window size
// services/analyticsService.js's own `monthly` series already uses for an
// analogous "months of history" chart — picked over the mock fixture's
// literal 7 so this report reads sensibly regardless of how much real order
// history has accumulated by the time it's viewed. See DECISIONS.md.
const REVENUE_BY_MONTH_COUNT = 12;

async function buildRevenueByMonth() {
  const todayUtc = utcDateOnly(new Date());
  const windowStart = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - (REVENUE_BY_MONTH_COUNT - 1), 1));

  const buckets = new Map();
  const order = [];
  for (let i = 0; i < REVENUE_BY_MONTH_COUNT; i += 1) {
    const d = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + i, 1));
    const key = yearMonthKey(d);
    order.push(key);
    buckets.set(key, { month: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`, revenue: 0, ordersCount: 0 });
  }

  const rows = await Order.findAll({
    attributes: ['paidAt', 'finalAmount'],
    where: { status: 'paid', paidAt: { [Op.gte]: windowStart } },
    raw: true,
  });
  for (const row of rows) {
    const bucket = buckets.get(yearMonthKey(new Date(row.paidAt)));
    if (bucket) {
      bucket.revenue += Number(row.finalAmount) || 0;
      bucket.ordersCount += 1;
    }
  }

  return order.map((key) => buckets.get(key));
}

// ---------------------------------------------------------------------------
// enrollmentsByCourse
// ---------------------------------------------------------------------------

/** One row per course with >=1 active enrollment. `totalRevenue` = SUM(final_amount) of ALL paid orders for that course (any status/date, not scoped to active enrollments only — task brief). Two grouped queries, never N+1 per course. */
async function buildEnrollmentsByCourse() {
  const grouped = await Enrollment.findAll({
    attributes: ['courseId', [fn('COUNT', col('id')), 'activeCount']],
    where: { status: 'active' },
    group: ['courseId'],
    raw: true,
  });
  if (grouped.length === 0) return [];

  const courseIds = grouped.map((g) => g.courseId);
  const [courses, revenueRows] = await Promise.all([
    Course.findAll({ where: { id: courseIds } }),
    Order.findAll({
      attributes: ['courseId', [fn('SUM', col('final_amount')), 'totalRevenue']],
      where: { status: 'paid', courseId: courseIds },
      group: ['courseId'],
      raw: true,
    }),
  ]);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const revenueByCourse = new Map(revenueRows.map((r) => [r.courseId, Number(r.totalRevenue) || 0]));

  // Judgment call: ranked by activeCount desc (ties broken by title asc for
  // determinism) — the report table has no explicit ordering requirement in
  // the task brief; "most-enrolled course first" is the natural read order
  // for a business report. See DECISIONS.md.
  return grouped
    .map((g) => ({
      courseTitle: courseById.get(g.courseId)?.title ?? '',
      activeCount: Number(g.activeCount) || 0,
      totalRevenue: revenueByCourse.get(g.courseId) || 0,
    }))
    .sort((a, b) => b.activeCount - a.activeCount || a.courseTitle.localeCompare(b.courseTitle));
}

// ---------------------------------------------------------------------------
// qbankUsage
// ---------------------------------------------------------------------------

const QBANK_USAGE_WINDOW_DAYS = 30;

async function buildQbankUsage() {
  const thirtyDaysAgo = new Date(Date.now() - QBANK_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [totalQuestionsAttempted, passRateRow, activePracticeCandidates, topSubjectsAttempted] = await Promise.all([
    TestAttemptQuestion.count({ where: { answeredAt: { [Op.ne]: null } } }),
    TestSession.findOne({
      attributes: [[fn('AVG', col('passed')), 'avgPassed']],
      where: { status: 'completed', passed: { [Op.ne]: null } },
      raw: true,
    }),
    TestSession.count({ distinct: true, col: 'userId', where: { startedAt: { [Op.gte]: thirtyDaysAgo } } }),
    buildTopSubjectsAttempted(),
  ]);

  const averagePassRate = passRateRow?.avgPassed != null ? round1(Number(passRateRow.avgPassed) * 100) : 0;

  return { totalQuestionsAttempted, averagePassRate, activePracticeCandidates, topSubjectsAttempted };
}

/** Top 5 subjects by ATTEMPTED (answered) question count, join TestAttemptQuestion -> Question -> Subject, grouped by (subject_id, is_correct) — same shape as services/analyticsService.js#computeGroupPerformance, just global (not scoped to one userId) and restricted to answered rows. */
async function buildTopSubjectsAttempted() {
  const rows = await TestAttemptQuestion.findAll({
    attributes: [
      [col('question.subject_id'), 'subjectId'],
      [col('TestAttemptQuestion.is_correct'), 'isCorrect'],
      [fn('COUNT', col('TestAttemptQuestion.id')), 'cnt'],
    ],
    include: [{ model: Question, as: 'question', attributes: [], required: true }],
    where: { answeredAt: { [Op.ne]: null } },
    group: [col('question.subject_id'), col('TestAttemptQuestion.is_correct')],
    raw: true,
  });

  const byGroup = new Map();
  for (const row of rows) {
    const subjectId = row.subjectId;
    if (subjectId == null) continue;
    if (!byGroup.has(subjectId)) byGroup.set(subjectId, { total: 0, correct: 0 });
    const bucket = byGroup.get(subjectId);
    const cnt = Number(row.cnt) || 0;
    bucket.total += cnt;
    if (row.isCorrect === true || row.isCorrect === 1) bucket.correct += cnt;
  }
  if (byGroup.size === 0) return [];

  const subjects = await Subject.findAll({ where: { id: [...byGroup.keys()] } });
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  return [...byGroup.entries()]
    .map(([subjectId, bucket]) => ({
      subject: subjectById.get(subjectId)?.name ?? '',
      attempts: bucket.total,
      avgScore: bucket.total > 0 ? round1((bucket.correct / bucket.total) * 100) : 0,
    }))
    .sort((a, b) => b.attempts - a.attempts || a.subject.localeCompare(b.subject))
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// topStudents
// ---------------------------------------------------------------------------

/** Top 10 students by completed-test count, then their overall qbank accuracy (across ALL their answered attempt-questions, any test-session status) + total study hours (from user_daily_stats). Three grouped queries total (testsTaken, accuracy, studyHours), scoped to the top-10 userId set once determined — never N+1 per student. */
async function buildTopStudents() {
  const testsTakenRows = await TestSession.findAll({
    attributes: ['userId', [fn('COUNT', col('id')), 'testsTaken']],
    where: { status: 'completed' },
    group: ['userId'],
    order: [[fn('COUNT', col('id')), 'DESC']],
    limit: 10,
    raw: true,
  });
  if (testsTakenRows.length === 0) return [];

  const userIds = testsTakenRows.map((r) => r.userId);

  const [users, accuracyRows, studyRows] = await Promise.all([
    User.findAll({ where: { id: userIds } }),
    TestAttemptQuestion.findAll({
      attributes: [
        [col('testSession.user_id'), 'userId'],
        [col('TestAttemptQuestion.is_correct'), 'isCorrect'],
        [fn('COUNT', col('TestAttemptQuestion.id')), 'cnt'],
      ],
      include: [{ model: TestSession, as: 'testSession', attributes: [], required: true, where: { userId: userIds } }],
      where: { answeredAt: { [Op.ne]: null } },
      group: [col('testSession.user_id'), col('TestAttemptQuestion.is_correct')],
      raw: true,
    }),
    UserDailyStat.findAll({
      attributes: ['userId', [fn('SUM', literal('`qbank_seconds` + `video_seconds`')), 'totalSeconds']],
      where: { userId: userIds },
      group: ['userId'],
      raw: true,
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));

  const accByUser = new Map();
  for (const row of accuracyRows) {
    const userId = row.userId;
    if (!accByUser.has(userId)) accByUser.set(userId, { total: 0, correct: 0 });
    const bucket = accByUser.get(userId);
    const cnt = Number(row.cnt) || 0;
    bucket.total += cnt;
    if (row.isCorrect === true || row.isCorrect === 1) bucket.correct += cnt;
  }
  const studyByUser = new Map(studyRows.map((r) => [r.userId, Number(r.totalSeconds) || 0]));

  return testsTakenRows.map((r) => {
    const userId = r.userId;
    const user = userById.get(userId);
    const acc = accByUser.get(userId) || { total: 0, correct: 0 };
    const studySeconds = studyByUser.get(userId) || 0;
    return {
      studentId: userId,
      name: user?.name ?? '',
      email: user?.email ?? '',
      testsTaken: Number(r.testsTaken) || 0,
      qbankAccuracy: acc.total > 0 ? round1((acc.correct / acc.total) * 100) : 0,
      studyHours: round1(studySeconds / 3600),
    };
  });
}

// ---------------------------------------------------------------------------
// GET /admin/reports
// ---------------------------------------------------------------------------

export async function getReportsData() {
  const [revenueByMonth, enrollmentsByCourse, qbankUsage, topStudents] = await Promise.all([
    buildRevenueByMonth(),
    buildEnrollmentsByCourse(),
    buildQbankUsage(),
    buildTopStudents(),
  ]);

  return { revenueByMonth, enrollmentsByCourse, qbankUsage, topStudents };
}

export default { getReportsData };
