import { z } from "zod/v3";
import { carrierSlugSchema, cycleSchema, dateSchema } from "./model";
export const stelaInputSchema = z.object({
  carrier: carrierSlugSchema.optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(6000) }).strict()).min(1).max(12),
  context: z.object({ date: dateSchema, cycle: cycleSchema, view: z.enum(["dashboard","availability","scheduling","links","registration","users"]) }).strict(),
}).strict().refine(input => input.messages.at(-1)?.role === "user", "Envie sua pergunta à Stela.")
  .refine(input => input.messages.reduce((total, message) => total + message.content.length, 0) <= 20000, "Inicie uma nova conversa para continuar.");
export type StelaInput = z.infer<typeof stelaInputSchema>;
export type StelaReply = { text: string; engine: "ai" | "guide"; notice?: string; speechTicket?: string; sources: { id: string; title: string }[]; actions: { label: string; view: string }[]; suggestions: string[]; knowledgeVersion: string; context: { date: string; cycle: string }; };
