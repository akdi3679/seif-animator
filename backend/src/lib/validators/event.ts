// backend/src/lib/validators/event.ts
import { z } from 'zod'

export const eventSchema = z.object({
  titleFr: z.string().min(3, 'Title in French is required'),
  titleAr: z.string().min(3, 'Title in Arabic is required'),
  descriptionFr: z.string().min(10, 'Description in French is required'),
  descriptionAr: z.string().min(10, 'Description in Arabic is required'),
  date: z.string().datetime('Invalid date format'),
  capacity: z.number().int().positive('Capacity must be a positive integer'),
  price: z.number().nonnegative('Price must be a non-negative number'),
  location: z.string().min(3, 'Location is required'),
})