// server/src/routes/v1/health.js
// GET /api/v1/health -> {success:true,data:{status:'ok', db:<bool>}}
// Attempts a short-timeout sequelize.authenticate(); never throws/crashes
// or hangs the request if MySQL is unreachable — reports db:false instead.
import { Router } from 'express';
import { checkDbConnection } from '../../db/sequelize.js';

const router = Router();

router.get('/', async (req, res) => {
  const db = await checkDbConnection();
  res.json({
    success: true,
    data: { status: 'ok', db },
  });
});

export default router;
