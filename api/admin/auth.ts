import { requireAdmin } from '../../server/admin.js';

export default function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;
  res.statusCode = 204;
  res.end();
}

