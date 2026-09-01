import { Request, Response } from "express";
import {
  DEFAULT_LIMIT_PER_TYPE,
  MAX_LIMIT_PER_TYPE,
  searchDelivery,
} from "../services/search.service";

export async function search(req: Request, res: Response) {
  const term = typeof req.query.q === "string" ? req.query.q : "";

  // Clamped rather than rejected: the palette is the only caller and an
  // out-of-range limit is a caller bug, not something worth failing a
  // keystroke-frequency request over. The service clamps too — this keeps the
  // documented contract honest at the edge.
  const parsedLimit = parseInt(String(req.query.limit ?? ""), 10);
  const limit = Number.isNaN(parsedLimit)
    ? DEFAULT_LIMIT_PER_TYPE
    : Math.min(MAX_LIMIT_PER_TYPE, Math.max(1, parsedLimit));

  res.json(await searchDelivery(term, limit));
}
