import express from 'express';
import { z } from 'zod';
import { User, UserRole } from './types';
export interface AuthenticatedRequest extends express.Request {
    user?: User;
}
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodEnum<{
        teacher: "teacher";
        student: "student";
        parent: "parent";
        admin: "admin";
    }>;
}, z.core.$strip>;
export declare const loginHandler: express.RequestHandler;
export declare function authenticate(requiredRole?: UserRole): express.RequestHandler;
//# sourceMappingURL=auth.d.ts.map