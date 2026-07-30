// server/src/models/index.js
// ESM adaptation of the standard sequelize-cli-generated models/index.js
// auto-loader: imports every model file in this directory, initializes it
// against the shared Sequelize instance, then calls each model's static
// associate(models) (if defined) once all models are loaded — so association
// definitions can safely reference any other model regardless of load order.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { sequelize } from '../db/sequelize.js';
import { Sequelize as SequelizeLib } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelFiles = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.js') && f !== 'index.js');

const db = {};

for (const file of modelFiles) {
  const mod = await import(pathToFileURL(path.join(__dirname, file)).href);
  const defineModel = mod.default;
  const model = defineModel(sequelize);
  db[model.name] = model;
}

for (const modelName of Object.keys(db)) {
  if (typeof db[modelName].associate === 'function') {
    db[modelName].associate(db);
  }
}

db.sequelize = sequelize;
db.Sequelize = SequelizeLib;

export default db;
export const models = db;
