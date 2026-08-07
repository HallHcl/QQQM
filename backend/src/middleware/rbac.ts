import { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler";

export function requireRole(roleName: string) {
  return function (req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
      return next(new ApiError(401, "Not authenticated", "UNAUTHORIZED"));
    }

    if (!req.user.roles.includes(roleName)) {
      return next(new ApiError(403, "Insufficient permissions", "FORBIDDEN"));
    }

    next();
  };
}

export function requireAnyRole(roleNames: string[]) {
  return function (req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
      return next(new ApiError(401, "Not authenticated", "UNAUTHORIZED"));
    }

    if (!req.user.roles.some((role) => roleNames.includes(role))) {
      return next(new ApiError(403, "Insufficient permissions", "FORBIDDEN"));
    }

    next();
  };
}
