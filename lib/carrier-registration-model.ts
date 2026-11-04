import { z } from "zod/v3";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export function carrierSlug(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export const carrierRegistrationSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(2, "Informe o nome da transportadora.").max(80, "Use até 80 caracteres.").refine(name => !/[\u0000-\u001f\u007f]/.test(name), "Nome inválido."),
}).transform(data => ({ ...data, name: data.name.replace(/\s+/g, " ") }))
  .refine(data => carrierSlug(data.name).length >= 1 && carrierSlug(data.name).length <= 64, { message: "Use letras e números no nome, com até 64 caracteres no endereço.", path: ["name"] });
export type LogoFrame = { x: number; y: number; width: number; height: number; background: string };
export const logoFrameSchema = z.object({ x: z.number().finite().min(0), y: z.number().finite().min(0), width: z.number().finite().positive(), height: z.number().finite().positive(), background: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
