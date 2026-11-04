# Arquitetura e APIs

[Voltar ao README](../README.md)

## Aplicação e execução

O projeto usa React/TypeScript com estrutura App Router, executada por Vinext/Vite em Cloudflare Workers. [worker/index.ts](../worker/index.ts) prepara a origem dos gateways, instala os contextos por requisição e delega ao handler Vinext.

[vite.config.ts](../vite.config.ts) configura o build, os bindings locais D1/R2 e os plugins da plataforma. [`.openai/hosting.json`](../.openai/hosting.json) preserva a identidade do Site e os nomes dos bindings. Os helpers em `scripts/` fazem parte da fonte; o clone não depende de copiar um `node_modules` de outra máquina.

| Área | Arquivos de referência |
| --- | --- |
| Datas, ciclos e disponibilidade | `lib/model.ts`, `app/api/disponibilidade/route.ts` |
| Acesso e usuários | `lib/manager-access.ts`, `lib/manager-access-model.ts`, `lib/email-auth.ts` |
| Catálogo e transportadoras | `lib/carrier-registry.ts`, `lib/register-carrier.ts`, `lib/modal-catalog.ts` |
| Pedidos e placas | `lib/scheduling.ts`, `lib/scheduling-plates.ts`, rotas `api/scheduling` e `api/gestao/scheduling` |
| Calendarização | `lib/calendarization.ts`, `lib/calendarization-model.ts`, `config/calendarization.ts` |
| Alertas | `lib/browser-alerts.ts`, `lib/scheduling-alert-content.ts`, `app/components/scheduling-alerts.tsx` |
| Stela | `lib/stela-server.ts`, `lib/stela-knowledge.ts`, `app/components/stela-chat.tsx` |
| Voz | `lib/stela-voice.ts`, `lib/stela-speech-client.ts`, `lib/stela-speech-server.ts` |
| Gateways | `lib/hosting-gateway.ts`, `lib/gateway-context.ts`, `hosting/` |

## Dados persistentes

O esquema completo é [db/schema.ts](../db/schema.ts). As migrações em `drizzle/` são a sequência de evolução do banco.

| Tabelas | Conteúdo |
| --- | --- |
| `availability` | Uma resposta por transportadora, data e ciclo; quantidades, responsável, observações e revisão. |
| `registered_carriers` | Transportadoras cadastradas, slug, nome normalizado e referências/enquadramento de logos. |
| `modal_catalog` | Catálogo geral, frota fixa, tipo FF/SDD e nome de consulta. |
| `carrier_modals`, `carrier_modal_settings` | Liberações por transportadora e revisão da seleção. |
| `scheduling_requests` | Pedido, placas, configuração histórica, status, observação da decisão e resultado da consulta. |
| `scheduling_status_events` | Eventos de decisão por pedido/revisão para os alertas. |
| `calendarization_cache` | Projeções SMG1 com data de leitura e expiração. |
| `manager_users` | Cadastro ativo, permissões, papel master, verificação e estado do convite. |
| `email_auth_*` | Usuários, sessões, contas e verificações gerenciados pelo Better Auth. |
| `email_rate_limits`, `mail_deliveries` | Limites, coordenação de solicitações e histórico de envio. |
| `mail_settings` | Remetente e chave Resend cifrada. |
| `stela_voice_settings`, `stela_voice_usage` | Chave ElevenLabs cifrada, voz/ativação e reserva mensal de caracteres. |

R2 guarda os arquivos de logos enviados. As logos originais incluídas no projeto são arquivos estáticos. Conversas da Stela e arquivos de áudio não são persistidos nas tabelas do aplicativo.

## Autenticação e autorização

### Gestor

O login por e-mail emite uma sessão HttpOnly pelo Better Auth. Cada operação consulta o cadastro atual e as permissões do gestor. Bloqueios não dependem de esperar o cookie expirar. Abas ocultas também são protegidas no servidor.

`OWNER_EMAIL` identifica o master principal. A identidade nativa validada pelo Sites funciona como recuperação dessa conta na origem original. Outras identidades nativas não ganham acesso administrativo; gestores adicionais verificam o e-mail pelo fluxo da aplicação.

### Transportadora

Os links usam uma assinatura HMAC derivada de `LINK_SECRET`. A API recebe `Authorization: Bearer <chave da transportadora>` e confere a assinatura e o slug. O conteúdo da requisição ou da conversa não permite selecionar registros de outra transportadora.

### Origem e gateways

Mutações validam origem e o tipo/tamanho dos dados. As entradas alternativas precisam de um segredo próprio e de uma origem HTTPS permitida antes que o servidor confie no host encaminhado. Cabeçalhos de identidade nativa recebidos pelos gateways são descartados. A credencial do gateway não substitui a sessão nem a chave do portal.

O contexto de origem é isolado por requisição. As páginas e APIs dessas entradas não usam cache compartilhado. Sessões de navegador são independentes por domínio.

## Consistência dos pedidos

- `id`/`changeId` identificam tentativas e evitam pedidos/decisões duplicados em reenvios.
- Revisões fazem controle otimista de concorrência; uma revisão desatualizada recebe conflito em vez de sobrescrever outra tela.
- A gravação de pedidos confere novamente o prazo e o modal ativo no banco.
- Decisão e evento de status são gravados no mesmo batch transacional D1.
- O pedido preserva nome/configuração do modal e todas as placas usadas no envio.
- Resultado de calendarização tem revisão própria e não decide `done`/`not_done`.

Retirar um modal utiliza desativação lógica e mantém as referências históricas. Os cadastros iniciais são idempotentes e separados das migrações de esquema.

## Consulta externa

O servidor lê CSV filtrado para SMG1, valida estrutura e limites e permite redirecionamentos somente nos domínios Google autorizados no código. O cache vale até 60 segundos. Forçar reconsulta ignora o cache válido; falhas não reapresentam cache vencido como confirmação nova.

FF cruza placa/MLP/modal/semana/dia/ciclo. O ano é relacionado às datas explícitas da SDD, com tratamento da virada de ano. SDD considera quantidades acumuladas de pedidos pendentes ou feitos do mesmo recorte; pedidos não feitos não consomem esse total. Duplicidade, ausência, zero e conflito são estados diferentes.

## Referência das APIs

As rotas são internas à aplicação. Gestores usam a sessão; transportadoras usam a chave do próprio portal. As mutações exigem JSON e origem válida, exceto uploads de cadastro, cujo formulário é tratado pela rota correspondente. As validações e contratos completos estão nos schemas em `lib/` e nos arquivos `route.ts`.

### Transportadoras

| Método | Rota | Acesso / função |
| --- | --- | --- |
| GET, POST | `/api/disponibilidade` | Chave da transportadora; consultar/enviar disponibilidade. |
| GET, POST | `/api/scheduling` | Chave da transportadora; modais liberados e pedidos do próprio portal. |
| GET | `/api/scheduling/events` | Chave da transportadora; decisões para os alertas. |
| GET | `/api/logos/[slug]` | Imagem validada do cadastro; resposta com tipo explícito, `nosniff` e ETag. |

### Gestão

| Método | Rota | Permissão / função |
| --- | --- | --- |
| GET | `/api/gestao/acesso` | Sessão; acesso e permissões atuais. |
| GET | `/api/gestao` | `dashboard`; respostas e catálogo do recorte selecionado. |
| GET | `/api/gestao/links` | `links`; links assinados dos portais. |
| GET, POST | `/api/gestao/transportadoras` | `registration`; catálogo/cadastro, incluindo logo. |
| GET, POST, PATCH, PUT | `/api/gestao/modais` | `registration`; base geral, configuração e liberações. |
| GET, PATCH | `/api/gestao/scheduling` | `scheduling`; paginação de pedidos e decisão. |
| GET | `/api/gestao/scheduling/events` | `scheduling`; novos pedidos para os alertas. |
| GET, POST | `/api/gestao/calendarizacao` | `registration` ou `scheduling` para a fonte; reconsulta de pedido exige `scheduling`. |
| GET, POST, PATCH | `/api/gestao/usuarios` | Master; cadastro e permissões de usuários. |
| GET, PUT, POST | `/api/gestao/email` | Master; configuração e teste do remetente. |
| GET, PUT | `/api/gestao/stela-voz` | Master; configuração cifrada e catálogo de vozes. |

### Login e Stela

| Método | Rota | Função |
| --- | --- | --- |
| POST | `/api/auth/email-otp/send-verification-otp` | Solicitar código para e-mail cadastrado; cooldown e limites no servidor. |
| POST | `/api/auth/sign-in/email-otp` | Validar código e emitir a sessão, com opção de persistência. |
| POST | `/api/auth/sign-out` | Revogar a sessão atual. |
| GET, POST | `/api/stela` | Metadados/sugestões e respostas com contexto autorizado. |
| POST | `/api/stela/voz` | Áudio de resposta assinada ou frase fixa de teste, com autorização do perfil. |
| GET | `/api/fleetops-release` | SHA GitHub e metadados públicos da versão, sem dados operacionais nem cache. |

### Exemplos de contratos

Decisão de Scheduling, enviada para `PATCH /api/gestao/scheduling`:

```json
{
  "id": "UUID_DO_PEDIDO",
  "status": "not_done",
  "resolutionNotes": "Veículo não disponibilizado no horário solicitado.",
  "revision": 1,
  "changeId": "NOVO_UUID_DA_TENTATIVA"
}
```

Os identificadores acima são placeholders. Use o `id` e a revisão retornados pelo servidor e gere um UUID novo para uma nova decisão. A resposta atualizada é a fonte para a próxima revisão.

Em geração de voz, o cliente envia `ticket` emitido pela própria resposta da Stela. Texto livre não é aceito. A credencial ElevenLabs não é enviada ao navegador nem adicionada à requisição feita pelo cliente ao FleetOps.

### Códigos de resposta

| Código | Interpretação típica |
| --- | --- |
| 400 | Dados inválidos, data/ciclo ou contrato incorreto. |
| 403 | Sem acesso, origem inválida, link inválido ou data encerrada. |
| 404 | Recurso não encontrado ou rota de QA fora de desenvolvimento. |
| 409 | Revisão desatualizada, tentativa reutilizada com conteúdo diferente ou configuração pendente. |
| 413 | Entrada muito extensa. |
| 422 | Modal/placa/liberação incompatível. |
| 429 | Limite local ou do provedor atingido; observe `Retry-After` quando fornecido. |
| 503 | Serviço/configuração indisponível ou falha de integração. |

O HTTP do FleetOps pode ser diferente do HTTP externo: por exemplo, uma falha ElevenLabs pode chegar como 503 da aplicação e informar `HTTP 402 · payment_required` no diagnóstico sanitizado. Não use a mensagem privada do provedor como conteúdo direto da interface ou dos logs.
