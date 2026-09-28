// backend/src/lib/validators/auth.ts
import { z } from 'zod'

// Tunisian phone number validation regex
const TUNISIAN_PHONE_REGEX = /^(?:(?:\+|00)216)?[2459]\d{7}$/

// Email validation regex (optional, but can keep)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  deviceFingerprint: z.string().optional() , 
    geo: z.any().optional()

})

export const registerSchema = z.object({
  email: z.string().email('Invalid email format').regex(EMAIL_REGEX),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

// REPLACE your current verify2FASchema and any reset code schema with:
export const verify2FASchema = z.object({
  sessionId: z.string().min(1, 'Session ID required'),
  code: z
    .string()
    .length(6, 'Code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Valid email required'),
  code: z
    .string()
    .length(6, 'Code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// Profile schema (if needed)
export const profileSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().regex(TUNISIAN_PHONE_REGEX, 'Invalid Tunisian phone number').optional(),
  firstName: z.string().min(2, 'First name must be at least 2 characters').optional(),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').optional(),
})