import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';

export const bookingCreateSchema = z.object({
  type: z.enum(['public', 'private']),
  serviceType: z.string().min(1, 'Service type required'),
  customService: z.string().optional(),
  childrenCount: z.number().int().min(1).max(20).default(1),
  eventName: z.string().optional(),
  description: z.string().optional(),
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .regex(/^[\p{L}\p{M}\p{Zs}.'-]+$/u, 'Name contains invalid characters'),
  email: z.string()
    .email('Invalid email address')
    .regex(/^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/, 'Invalid email format'),
  phone: z.string()
    .min(1, 'Phone number required')
    .refine((val) => isValidPhoneNumber(val), 'Invalid phone number'),
  notes: z.string().max(1000).optional(),
  location: z.string().min(1, 'Location required'), // now required
  imageUrl: z.string().url().optional(),
  imagePublicId: z.string().optional(),     
  token: z.preprocess((val) => val === null ? undefined : val, z.string().optional()),
  
});

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;