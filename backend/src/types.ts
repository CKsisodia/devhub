export type RoleName = "admin" | "viewer";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
