import { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler";

export function requireRole(roleName: string) {
  return function (req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
      return next(new ApiError(401, "Not authenticated"));
    }

    if (!req.user.roles.includes(roleName)) {
      return next(new ApiError(403, "Insufficient permissions"));
    }

    next();
  };
}
