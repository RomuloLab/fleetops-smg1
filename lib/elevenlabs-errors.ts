type FailureStage = "catalog" | "speech";

const codeGroups = {
  key: ["invalid_api_key", "missing_api_key", "needs_authorization", "unauthorized", "authentication_error", "invalid_authorization_header"],
  permissions: ["missing_permissions", "insufficient_permissions", "forbidden", "authorization_error", "workspace_access_denied"],
  credits: ["quota_exceeded", "insufficient_credits", "character_limit_exceeded"],
  payment: ["payment_required"],
  plan: ["subscription_required", "feature_not_available", "model_access_denied"],
  voice: ["voice_not_found", "voice_access_denied", "invalid_voice_id"],
  rate: ["rate_limit_exceeded", "rate_limit_error", "concurrent_limit_exceeded", "too_many_concurrent_requests", "system_busy"],
  blocked: ["detected_unusual_activity"],
  validation: ["validation_error", "invalid_request", "bad_request", "invalid_page_size", "invalid_cursor", "unsupported_model", "invalid_output_format", "max_character_limit_exceeded"],
  service: ["internal_error", "service_unavailable", "maintenance"],
} as const;
const knownCodes = new Set<string>(Object.values(codeGroups).flat());
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// Provider messages can contain private data. Read a bounded body and keep only
// documented identifiers; neither messages nor unknown identifiers leave here.
async function errorCode(response: Response): Promise<string | undefined> {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const decoder = new TextDecoder(); let body = ""; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); return undefined; }
      body += decoder.decode(value, {stream: true});
    }
    body += decoder.decode();
    const root = record(JSON.parse(body)); const detail = record(root.detail); const error = record(root.error);
    return [detail.code, detail.status, root.code, error.code, detail.type, root.type, error.type]
      .find((value): value is string => typeof value === "string" && knownCodes.has(value));
  } catch { return undefined; }
  finally { reader.releaseLock(); }
}

export async function elevenlabsFailure(response: Response, stage: FailureStage) {
  const code = await errorCode(response); const status = response.status;
  const group = (Object.keys(codeGroups) as (keyof typeof codeGroups)[])
    .find(name => (codeGroups[name] as readonly string[]).includes(code || ""));
  let message: string;
  if (group === "key" || (!group && status === 401)) message = "A chave da ElevenLabs foi recusada. Confira se você copiou a chave API completa e se ela continua ativa.";
  else if (group === "permissions" || (!group && status === 403)) message = stage === "catalog"
    ? "A chave não tem permissão para consultar vozes. Na ElevenLabs, libere Voices (Vozes) — Ler nessa chave."
    : "A chave não tem permissão para gerar este áudio. Confira Text to Speech — Acesso e a permissão para usar a voz escolhida.";
  else if (group === "credits") message = "A ElevenLabs informou falta de créditos ou limite da chave atingido. Confira o saldo da conta e o limite de uso dessa chave.";
  else if (group === "payment" || (!group && status === 402)) message = "A ElevenLabs exige pagamento para esta solicitação. Confira se a voz pode ser usada via API no seu plano e verifique o saldo da conta e o limite da chave. Vozes da Voice Library não estão disponíveis via API no plano gratuito; adicionar créditos não remove essa restrição de plano.";
  else if (group === "plan") message = "A ElevenLabs informou que este recurso exige outro acesso ou plano. Confira a disponibilidade do modelo e da voz na sua conta.";
  else if (group === "voice" || (!group && status === 404 && stage === "speech")) message = "A voz escolhida não está disponível para essa conta. Carregue as vozes e selecione outra.";
  else if (group === "rate" || (!group && status === 429)) message = "A ElevenLabs limitou as solicitações. Aguarde um pouco antes de tentar novamente.";
  else if (group === "blocked") message = "A ElevenLabs restringiu o uso dessa conta por atividade incomum. Consulte o aviso na sua conta ou o suporte da ElevenLabs.";
  else if (group === "validation" || (!group && (status === 400 || status === 422))) message = stage === "catalog"
    ? "A ElevenLabs recusou os parâmetros da consulta de vozes. O código abaixo permite identificar o ajuste necessário."
    : "A ElevenLabs recusou os parâmetros do áudio. O código abaixo permite identificar o ajuste necessário.";
  else if (group === "service" || status >= 500) message = "A ElevenLabs está indisponível ou retornou uma falha de serviço. Tente novamente mais tarde.";
  else if (status >= 300 && status < 400) message = "A consulta à ElevenLabs retornou um redirecionamento que não pôde ser confirmado.";
  else message = "Não foi possível concluir a solicitação à ElevenLabs. O código abaixo permite identificar a causa.";
  return {
    message: message + ` Diagnóstico: HTTP ${status}${code ? " · " + code : ""}.`,
    status: group === "rate" || status === 429 ? 429 : 503,
    diagnostic: {stage, httpStatus: status, code: code || "unclassified"},
  };
}
