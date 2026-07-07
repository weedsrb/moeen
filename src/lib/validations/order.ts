import { z } from "zod/v4";

export const orderStatusSchema = z.enum([
  "collecting",
  "ai_proposal",
  "incoming",
  "pending",
  "confirmed",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
  note: z.string().max(500).optional(),
});

export const orderItemInputSchema = z.object({
  product_id: z.string().uuid().nullable(),
  product_name: z.string().min(1).max(200),
  variant: z.string().max(100).nullable(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
});

export const updateOrderSchema = z.object({
  delivery_address: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  items: z.array(orderItemInputSchema).min(1).optional(),
});

export const createManualOrderSchema = z.object({
  customer_id: z.string().uuid(),
  delivery_address: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  currency: z.enum(["ILS", "USD", "JOD"]).default("ILS"),
  items: z.array(orderItemInputSchema).min(1),
});

export const createCustomerInlineSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(3).max(40),
  delivery_address: z.string().max(500).optional(),
});
