import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';

export const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string()
    .optional()
    .refine((val) => !val || isValidPhoneNumber(val), 'Invalid phone number'),
  message: z.string().min(10).max(2000),
  subjectId: z.string().uuid().optional(),
  customSubject: z.string().max(200).optional(),
}).refine((data) => data.email || data.phone, {
  message: 'At least one contact method (email or phone) is required',
  path: ['email'],
});