import { z } from "zod/v3";
import { carrierSlugSchema } from "./model";
import type { CalendarizationType } from "./calendarization-model";

export type CatalogModal = { id: string; code: string; name: string; isFixedFleet: boolean; calendarizationType: CalendarizationType; sourceModalName: string; revision: number };
export type CarrierModalSelection = { carrier: string; codes: string[]; revision: number };
export type ModalManagementData = { modals: CatalogModal[]; selection?: CarrierModalSelection };

export function modalNameKey(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}
const calendarFields = {
  isFixedFleet: z.boolean().default(false), calendarizationType: z.enum(["none", "FF", "SDD"]).default("none"),
  sourceModalName: z.string().trim().max(80).default(""),
};
export const createModalSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().transform(value => value.replace(/\s+/g, " ")).pipe(z.string().min(2).max(80)),
  ...calendarFields,
}).refine(value => value.isFixedFleet ? value.calendarizationType === "FF" : value.calendarizationType !== "FF", { message: "A consulta FF exige frota fixa. Para outros modais, selecione SDD ou sem consulta." });
export const updateModalSchema = z.object({ id: z.string().min(1).max(140), changeId: z.string().uuid(), revision: z.number().int().positive(), ...calendarFields })
  .refine(value => value.isFixedFleet ? value.calendarizationType === "FF" : value.calendarizationType !== "FF", { message: "A consulta FF exige frota fixa. Para outros modais, selecione SDD ou sem consulta." });
export const assignModalsSchema = z.object({
  carrier: carrierSlugSchema, changeId: z.string().uuid(), revision: z.number().int().positive(),
  codes: z.array(z.string().min(1).max(80)).max(200),
}).refine(value => new Set(value.codes).size === value.codes.length, { message: "Selecione cada modal apenas uma vez.", path: ["codes"] });
