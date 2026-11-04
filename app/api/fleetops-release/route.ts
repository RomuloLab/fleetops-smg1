import release from "@/config/release.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    repository: "RomuloLab/fleetops-smg1",
    branch: "main",
    commit: /^[a-f0-9]{40}$/.test(release.sourceCommit) ? release.sourceCommit : null,
    runId: /^[0-9]{1,20}$/.test(release.sourceRunId) ? release.sourceRunId : null,
    publishedAt: /^\d{4}-\d{2}-\d{2}T/.test(release.publishedAt) ? release.publishedAt.slice(0,32) : null,
  }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}
