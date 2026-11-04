import { z } from "zod/v3";
import { carrierSlugSchema } from "./model";

export const STELA_SPEECH_MODEL = "eleven_multilingual_v2";
export const STELA_SPEECH_TEST = "Olá! Eu sou a Stela, sua assistente no FleetOps. Posso ajudar você com disponibilidade, Scheduling e calendarização. Vamos organizar a próxima expedição?";
export const voiceSettingsSchema = z.object({
  apiKey: z.string().trim().max(512).optional(),
  voiceId: z.string().trim().max(80).regex(/^[A-Za-z0-9_-]*$/, "Confira o identificador da voz."),
  voiceName: z.string().trim().max(120), enabled: z.boolean(),
  monthlyLimit: z.number().int().min(100).max(1000000), revision: z.number().int().min(0), changeId: z.string().uuid(),
}).strict();
export const speechInputSchema = z.union([
  z.object({ carrier: carrierSlugSchema.optional(), ticket: z.string().min(20).max(36000) }).strict(),
  z.object({ carrier: carrierSlugSchema.optional(), test: z.literal(true) }).strict(),
]);
export type VoiceSettingsInput = z.infer<typeof voiceSettingsSchema>;
export type SpeechInput = z.infer<typeof speechInputSchema>;
export type StelaSpeechMetadata = { provider: "browser" | "elevenlabs"; voiceName?: string; revision?: number };
export type StelaVoiceSettingsInfo = {
  configured: boolean; enabled: boolean; voiceId: string; voiceName: string; monthlyLimit: number; usedCharacters: number;
  period: string; revision: number; updatedAt: string | null; secretReady: boolean; model: string;
};
export type StelaVoiceOption = { id: string; name: string; language: string; accent: string; gender: string };
export function speechText(text: string) { return text.replace(/[`*#]/g, "").replace(/\s+/g, " ").trim().slice(0,6000); }
