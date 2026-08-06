import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "./errorHandler";
import { AuthenticatedUser } from "../types";

interface JwtPayload {
  id: string;
  peopleId: string | null;
  roles: string[];
}

export function auth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(new ApiError(401, "Missing or invalid Authorization header"));
  }

  const token = header.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return next(new ApiError(500, "JWT secret is not configured"));
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    const user: AuthenticatedUser = {
      id: payload.id,
      peopleId: payload.peopleId,
      roles: payload.roles,
    };
    req.user = user;
    next();
  } catch {
    return next(new ApiError(401, "Invalid or expired token"));
  }
}
