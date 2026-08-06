import { Request, Response } from "express";
import { listActivityLogs } from "../services/activityLogs.service";

export async function list(req: Request, res: Response) {
  const entityType = typeof req.query.entity_type === "string" ? req.query.entity_type : undefined;
  const entityId = typeof req.query.entity_id === "string" ? req.query.entity_id : undefined;
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;

  const logs = await listActivityLogs({ entityType, entityId, from, to });
  res.json(logs);
}
