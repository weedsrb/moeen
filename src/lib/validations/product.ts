import { z } from "zod";

const productVariantSchema = z.object({
  name: z.string().min(1, "Variant name is required"),
  options: z.array(z.string().min(1)).min(1, "At least one option is required"),
});

export const createProductSchema = z.object({
  name: z.string().min(2, "Product name must be at least 2 characters"),
  price: z.number().positive("Price must be greater than 0"),
  currency: z.enum(["ILS", "USD", "JOD"]).default("ILS"),
  quantity_total: z
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative"),
  description: z.string().optional(),
  alternative_names: z.array(z.string()).optional(),
  low_stock_threshold: z
    .number()
    .int()
    .min(0, "Threshold cannot be negative")
    .optional(),
  variants: z.array(productVariantSchema).optional(),
  image_url: z.string().url().optional(),
  is_active: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();

export const bulkIdsSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, "Select at least one product")
    .max(500, "Too many products selected at once"),
});

// Activate/deactivate toggle (soft, reversible): false = archive, true = restore.
export const bulkStatusSchema = bulkIdsSchema.extend({
  is_active: z.boolean(),
});

export const stockAdjustmentSchema = z.object({
  adjustment: z
    .number()
    .int("Adjustment must be a whole number")
    .refine((v) => v !== 0, "Adjustment cannot be zero"),
  reason: z.string().min(1, "Reason is required"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type BulkIdsInput = z.infer<typeof bulkIdsSchema>;
export type BulkStatusInput = z.infer<typeof bulkStatusSchema>;
