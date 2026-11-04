import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { registeredCarriers } from "@/db/schema";
import { carrierSlugSchema } from "@/lib/model";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!carrierSlugSchema.safeParse(slug).success) return new Response(null,{status:404});
    const carrier = (await getDb().select().from(registeredCarriers).where(eq(registeredCarriers.slug,slug)).limit(1))[0];
    if (!carrier?.logoKey || !env.BUCKET) return new Response(null,{status:404});
    const object = await env.BUCKET.get(carrier.logoKey); if (!object) return new Response(null,{status:404});
    const headers = new Headers({ "Content-Type": carrier.logoMime ?? "application/octet-stream", "Cache-Control": "public, max-age=86400", "ETag": object.httpEtag, "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" });
    if (request.headers.get("if-none-match") === object.httpEtag) return new Response(null,{status:304,headers});
    return new Response(object.body,{headers});
  } catch { return new Response(null,{status:503,headers:{"Cache-Control":"no-store"}}); }
}
