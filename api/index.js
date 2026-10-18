import { app } from '../apps/api/dist/app.js';

export default function handler(req, res) {
  return app(req, res);
}
