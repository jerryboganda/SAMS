// server/src/controllers/studentVideoController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/videoService.js.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import * as videoService from '../services/videoService.js';

// --- Schemas -------------------------------------------------------------

const lectureIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// `sessionKey`/`positionSeconds`/`deltaSeconds` (not the API-spec shorthand's
// `position`/`delta`) — confirmed against the already-built frontend's real
// call site (client/src/api/endpoints/video.ts's `sendPlaybackHeartbeat`,
// consumed by client/src/components/player/SecurePlayer.tsx) per CLAUDE.md
// §1a. Deliberately not zod-bounded to a "sane" numeric range here — the
// task requires these be clamped server-side (advisory client input), not
// rejected; see services/videoService.js's clamp() + config/constants.js.
const heartbeatBodySchema = z.object({
  sessionKey: z.string().trim().min(1).max(36),
  positionSeconds: z.number().finite(),
  deltaSeconds: z.number().finite(),
});

// --- Helpers ---------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// --- Handlers ----------------------------------------------------------------

export const play = asyncHandler(async (req, res) => {
  const { id } = validateBody(lectureIdParamSchema, req.params);
  const data = await videoService.getLecturePlayback({
    lectureId: id,
    user: req.user ?? null,
    rawDeviceToken: req.cookies?.device_token,
  });
  ok(res, data);
});

export const heartbeat = asyncHandler(async (req, res) => {
  const { id } = validateBody(lectureIdParamSchema, req.params);
  const body = validateBody(heartbeatBodySchema, req.body);
  const data = await videoService.heartbeat({
    lectureId: id,
    user: req.user,
    sessionKey: body.sessionKey,
    positionSeconds: body.positionSeconds,
    deltaSeconds: body.deltaSeconds,
  });
  ok(res, data);
});

export const complete = asyncHandler(async (req, res) => {
  const { id } = validateBody(lectureIdParamSchema, req.params);
  const data = await videoService.markLectureComplete({ lectureId: id, user: req.user });
  ok(res, data);
});

export const addBookmark = asyncHandler(async (req, res) => {
  const { id } = validateBody(lectureIdParamSchema, req.params);
  const data = await videoService.addLectureBookmark({ lectureId: id, user: req.user });
  ok(res, data, 201);
});

export const removeBookmark = asyncHandler(async (req, res) => {
  const { id } = validateBody(lectureIdParamSchema, req.params);
  const data = await videoService.removeLectureBookmark({ lectureId: id, user: req.user });
  ok(res, data);
});

export const listBookmarks = asyncHandler(async (req, res) => {
  const data = await videoService.listBookmarkedLectures({ user: req.user });
  ok(res, data);
});
