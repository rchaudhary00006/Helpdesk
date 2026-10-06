import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@helpdesk/db';
import { isStaff, type Role } from '@helpdesk/shared';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';

export const SESSION_COOKIE = 'hd_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function setSessionCookie(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Returns the active user for a session token, or null. Shared with the Socket.IO handshake. */
export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  let userId: string;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || !payload.sub) return null;
    userId = payload.sub;
  } catch {
    return null;
  }
  // Hit the DB each time so deactivating a user or changing their role takes effect immediately.
  // Cache this in Redis if it ever shows up in profiles.
  return prisma.user.findFirst({
    where: { id: userId, active: true },
    select: { id: true, email: true, name: true, role: true, organizationId: true },
  });
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const user = await userFromToken(req.cookies?.[SESSION_COOKIE]);
  if (!user) throw unauthorized();
  req.user = user;
  next();
};

export const requireStaff: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !isStaff(req.user.role)) throw forbidden();
  next();
};

/** Use after requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
