import { Request, Response } from "express";
import { listActivityLogs, ListActivityLogsParams } from "../services/activityLogs.service";

function parseListQuery(req: Request): ListActivityLogsParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.per_page ?? "20"), 10) || 20)
  );
  const order = String(req.query.order ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const entityType = typeof req.query.entity_type === "string" && req.query.entity_type.length > 0
    ? req.query.entity_type
    : undefined;
  const entityId = typeof req.query.entity_id === "string" && req.query.entity_id.length > 0
    ? req.query.entity_id
    : undefined;
  const action = typeof req.query.action === "string" && req.query.action.length > 0
    ? req.query.action
    : undefined;
  const changedBy = typeof req.query.changed_by === "string" && req.query.changed_by.length > 0
    ? req.query.changed_by
    : undefined;
  const from = typeof req.query.from === "string" && req.query.from.length > 0 ? req.query.from : undefined;
  const to = typeof req.query.to === "string" && req.query.to.length > 0 ? req.query.to : undefined;

  return { page, perPage, order, entityType, entityId, action, changedBy, from, to };
}

export async function list(req: Request, res: Response) {
  const result = await listActivityLogs(parseListQuery(req));
  res.json(result);
}
