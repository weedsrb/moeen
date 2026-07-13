import { z } from "zod";

// --- Stage 1: structure-detection request ---

const sampleSheetSchema = z.object({
  name: z.string(),
  sampleRows: z.array(z.array(z.string())),
  totalRows: z.number().int().min(0),
});

export const detectRequestSchema = z.object({
  sample: z.object({
    fileName: z.string(),
    sheets: z.array(sampleSheetSchema).min(1, "No sheets found in the file"),
  }),
  preferSheet: z.string().optional(),
});

// --- Commit: bulk create/update request ---

const commitDraftSchema = z.object({
  action: z.enum(["create", "update"]),
  productId: z.string().uuid().optional(),
  name: z.string().min(1, "Product name is required"),
  price: z.number().positive("Price must be greater than 0"),
  currency: z.enum(["ILS", "USD", "JOD"]).default("ILS"),
  quantity_total: z
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative"),
  alternative_names: z.array(z.string()).default([]),
  description: z.string().nullable().default(null),
  variants: z
    .array(
      z.object({
        name: z.string().min(1),
        options: z.array(z.string().min(1)).min(1),
      })
    )
    .nullable()
    .default(null),
});

export const commitRequestSchema = z.object({
  fileName: z.string().max(255),
  sheetName: z.string().max(255),
  /** Total rows the parser saw in the chosen sheet (for the audit log). */
  rowCount: z.number().int().min(0),
  drafts: z.array(commitDraftSchema).min(1, "Nothing to import"),
});

export type DetectRequest = z.infer<typeof detectRequestSchema>;
export type CommitRequest = z.infer<typeof commitRequestSchema>;
