// server/src/middleware/notFound.js
// 404 handler in the standard API envelope shape. Mounted after all real
// routes (and, for non-API paths, after the SPA fallback once client/dist
// exists) so anything unmatched under /api/* or /uploads/* lands here.
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

export default notFound;
