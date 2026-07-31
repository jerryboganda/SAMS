// server/src/utils/reorder.js
// Shared integrity check for every "reorder a list of sibling rows" admin
// endpoint (course sections within a course, lectures within a section,
// faculty/FAQ display order) — docs/07_EXECUTION_PLAN.md Phase 4.1's task
// brief: "must validate every id in orderedIds actually belongs to the right
// parent (reject if the set doesn't match exactly, don't silently ignore
// extras/missing)".
import { ApiError } from './apiError.js';

/**
 * Throws a 422 VALIDATION_ERROR unless `submittedIds` is EXACTLY the same
 * set as `currentIds` — same members, no duplicates, nothing missing, nothing
 * extra. A partial list would otherwise silently leave the un-submitted rows
 * in a stale sort position; an extra/foreign id would silently be ignored
 * (or worse, resolve to a row outside the intended parent). Order of
 * `submittedIds` is what determines the new sort order — that's the caller's
 * job, this only validates the *set*.
 */
export function assertExactIdSet(currentIds, submittedIds) {
  const currentNums = currentIds.map(Number);
  const submittedNums = submittedIds.map(Number);

  const submittedSet = new Set(submittedNums);
  if (submittedSet.size !== submittedNums.length) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'The id list must not contain duplicates.');
  }

  const currentSet = new Set(currentNums);
  const missing = currentNums.filter((id) => !submittedSet.has(id));
  const extra = submittedNums.filter((id) => !currentSet.has(id));

  if (missing.length > 0 || extra.length > 0) {
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      'The submitted id list must exactly match the current set of items — none missing, none extra/foreign.',
      { missing, extra }
    );
  }
}

export default assertExactIdSet;
