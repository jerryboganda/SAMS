// server/src/services/adminDashboardService.js
// GET /admin/dashboard (docs/07_EXECUTION_PLAN.md 11.1, docs/04_API_SPEC.md
// §7). Response shape matched EXACTLY to client/src/types/index.ts's
// `AdminDashboardKPIs` interface (per CLAUDE.md §1a) plus one deliberate,
// documented extension (`revenueTrend` — see below). Layering: routes ->
// controllers -> services -> models (CLAUDE.md §4).
//
// Reuses services/orderService.js's exported `ORDER_ASSOCIATIONS` +
// `serializeOrder` for `recentOrders` rather than re-implementing order
// serialization (task brief) — same reuse discipline
// services/adminOrderService.js and services/manualPaymentService.js already
// establish for this exact pair of exports.
import { Op, fn, col } from 'sequelize';
import db from '../models/index.js';
import * as orderService from './orderService.js';

const { Order, User, Enrollment, Course } = db;
const { ORDER_ASSOCIATIONS, serializeOrder } = orderService;

// docs/07_EXECUTION_PLAN.md 11.1's own text: pendingTransfersCount is
// `Order.count({ where: { gateway: IN ['raast','bank_transfer'], status:
// 'awaiting_verification' } })` — the EXACT SAME equivalence
// services/manualPaymentService.js#resolveQueueOrderStatus's own doc comment
// already establishes/justifies (orders.status alone, never a join to
// bank_transfer_proofs, is provably equivalent to "has a pending proof" in
// this codebase because submitBankProof/approveBankTransfer/
// rejectBankTransfer always transition both tables together, atomically).
// Reusing that reasoning here rather than re-deriving it.
const MANUAL_GATEWAYS = ['raast', 'bank_transfer'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function utcDateOnly(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayKey(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** "Aug 5" — short month + day, no year (task brief's exact `revenueTrend[].day` format). */
function shortDayLabel(d) {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** SUM(orders.final_amount) for status='paid' orders, optionally further filtered (e.g. by paidAt window). Returns a plain JS number — fine for an aggregate TOTAL display value, never re-stored (see server/src/utils/money.js's own header + this task's brief). */
async function sumPaidRevenue(extraWhere = {}) {
  const row = await Order.findOne({
    attributes: [[fn('SUM', col('final_amount')), 'total']],
    where: { status: 'paid', ...extraWhere },
    raw: true,
  });
  return Number(row?.total) || 0;
}

/**
 * Top 5 courses by ACTIVE enrollment count, each with the course's total
 * paid-order revenue (docs/07_EXECUTION_PLAN.md 11.1's `topCourses` spec).
 * Two grouped aggregate queries (never N+1 per course): one for the
 * enrollment counts (which also determines the top-5 course id set and
 * ranking), one for paid-order revenue scoped to exactly those course ids.
 */
async function computeTopCourses() {
  const grouped = await Enrollment.findAll({
    attributes: ['courseId', [fn('COUNT', col('id')), 'enrollmentsCount']],
    where: { status: 'active' },
    group: ['courseId'],
    order: [[fn('COUNT', col('id')), 'DESC']],
    limit: 5,
    raw: true,
  });
  if (grouped.length === 0) return [];

  const courseIds = grouped.map((g) => g.courseId);
  const [courses, revenueRows] = await Promise.all([
    Course.findAll({ where: { id: courseIds } }),
    Order.findAll({
      attributes: ['courseId', [fn('SUM', col('final_amount')), 'revenue']],
      where: { status: 'paid', courseId: courseIds },
      group: ['courseId'],
      raw: true,
    }),
  ]);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const revenueByCourse = new Map(revenueRows.map((r) => [r.courseId, Number(r.revenue) || 0]));

  return grouped.map((g) => ({
    courseId: g.courseId,
    title: courseById.get(g.courseId)?.title ?? '',
    enrollmentsCount: Number(g.enrollmentsCount) || 0,
    revenue: revenueByCourse.get(g.courseId) || 0,
  }));
}

/**
 * `revenueTrend` — a deliberate, documented EXTENSION of
 * client/src/types/index.ts's `AdminDashboardKPIs` interface (task brief:
 * "extends the TS interface... this is a deliberate, documented
 * contract-drift fix, not a mistake"), replacing
 * AdminDashboardPage.tsx's current fully-hardcoded local `revenueTrendData`
 * array. NOT wired into the frontend by this change (client/ is out of
 * scope for this task) — the frontend edit to actually consume this field
 * is a separate follow-up; see this task's final report / DECISIONS.md.
 *
 * 30-day, zero-filled, chronological series, using the EXACT SAME
 * pre-seed-a-Map-then-fold-matching-rows-in bucketing technique
 * services/analyticsService.js#buildSeries already establishes for its own
 * `dailyTrend` series (reused here, not reinvented) — this guarantees a
 * gap-free, always-30-entry output regardless of which days actually have
 * paid orders.
 */
async function buildRevenueTrend() {
  const todayUtc = utcDateOnly(new Date());
  const windowStart = new Date(todayUtc);
  windowStart.setUTCDate(windowStart.getUTCDate() - 29); // 30 calendar days total, including today

  const buckets = new Map();
  const order = [];
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(windowStart);
    d.setUTCDate(d.getUTCDate() + i);
    const key = dayKey(d);
    order.push(key);
    buckets.set(key, { day: shortDayLabel(d), amount: 0 });
  }

  const rows = await Order.findAll({
    attributes: ['paidAt', 'finalAmount'],
    where: { status: 'paid', paidAt: { [Op.gte]: windowStart } },
    raw: true,
  });
  for (const row of rows) {
    const bucket = buckets.get(dayKey(new Date(row.paidAt)));
    if (bucket) bucket.amount += Number(row.finalAmount) || 0;
  }

  return order.map((key) => buckets.get(key));
}

// ---------------------------------------------------------------------------
// GET /admin/dashboard
// ---------------------------------------------------------------------------

export async function getDashboardKPIs() {
  const now = new Date();
  const todayStart = utcDateOnly(now); // "since local midnight UTC" (task brief)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    revenueToday,
    revenue7d,
    revenue30d,
    revenueTotal,
    pendingTransfersCount,
    newStudents30d,
    activeEnrollmentsCount,
    topCourses,
    recentOrderRows,
    revenueTrend,
  ] = await Promise.all([
    sumPaidRevenue({ paidAt: { [Op.gte]: todayStart } }),
    sumPaidRevenue({ paidAt: { [Op.gte]: sevenDaysAgo } }),
    sumPaidRevenue({ paidAt: { [Op.gte]: thirtyDaysAgo } }),
    sumPaidRevenue(),
    Order.count({ where: { gateway: { [Op.in]: MANUAL_GATEWAYS }, status: 'awaiting_verification' } }),
    User.count({ where: { role: 'student', createdAt: { [Op.gte]: thirtyDaysAgo } } }),
    Enrollment.count({ where: { status: 'active' } }),
    computeTopCourses(),
    Order.findAll({
      where: { status: 'paid' },
      include: ORDER_ASSOCIATIONS,
      order: [['paidAt', 'DESC']],
      limit: 5,
    }),
    buildRevenueTrend(),
  ]);

  return {
    revenueToday,
    revenue7d,
    revenue30d,
    revenueTotal,
    pendingTransfersCount,
    newStudents30d,
    activeEnrollmentsCount,
    topCourses,
    recentOrders: recentOrderRows.map(serializeOrder),
    revenueTrend,
  };
}

export default { getDashboardKPIs };
