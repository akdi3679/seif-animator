// backend/src/lib/validators/product.ts
import { z } from 'zod'

export const productSchema = z.object({
  nameFr: z.string().min(2, 'Name in French is required'),
  nameAr: z.string().min(2, 'Name in Arabic is required'),
  descriptionFr: z.string().optional(),
  descriptionAr: z.string().optional(),
  price: z.number().positive('Price must be a positive number'),
  stock: z.number().int().nonnegative('Stock must be a non-negative integer'),
  category: z.enum(['ticket', 'workshop', 'merchandise', 'other']),
  sku: z.string().min(3, 'SKU is required'),
})