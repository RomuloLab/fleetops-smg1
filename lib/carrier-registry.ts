import { asc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { registeredCarriers } from "@/db/schema";
import { CARRIERS, carrierSlugSchema, getCarrier, type Carrier } from "./model";
type Row = typeof registeredCarriers.$inferSelect;
export function presentCarrier(row: Row): Carrier {
  return { slug: row.slug, name: row.name, initials: row.initials, createdAt: row.createdAt,
    ...(row.logoKey ? { logo: { src: `/api/logos/${row.slug}?v=${row.logoHash.slice(0,16)}`, width: row.logoWidth, height: row.logoHeight, viewBox: row.logoViewBox, background: row.logoBackground } } : {}),
  };
}
export async function listCarriers(): Promise<Carrier[]> {
  const rows = await getDb().select().from(registeredCarriers).orderBy(asc(registeredCarriers.createdAt), asc(registeredCarriers.name));
  return [...CARRIERS, ...rows.map(presentCarrier)];
}
export async function findCarrier(slug: string): Promise<Carrier | undefined> {
  const base = getCarrier(slug); if (base) return base;
  if (!carrierSlugSchema.safeParse(slug).success) return undefined;
  const row = (await getDb().select().from(registeredCarriers).where(eq(registeredCarriers.slug, slug)).limit(1))[0];
  return row ? presentCarrier(row) : undefined;
}
export async function registrationWithIdOrName(id: string, nameKey: string) {
  return getDb().select().from(registeredCarriers).where(or(eq(registeredCarriers.id, id), eq(registeredCarriers.nameKey, nameKey))).limit(2);
}
