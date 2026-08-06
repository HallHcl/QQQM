import { Request } from "express";
import { ApiError } from "../middleware/errorHandler";

export function requireChangedBy(req: Request): string {
  if (!req.user?.peopleId) {
    throw new ApiError(
      403,
      "The authenticated user is not linked to a people record and cannot perform this action"
    );
  }
  return req.user.peopleId;
}

export function paramId(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw new ApiError(400, `Invalid path parameter: ${name}`);
  }
  return value;
}
