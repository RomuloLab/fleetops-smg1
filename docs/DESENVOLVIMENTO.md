# Desenvolvimento

[Voltar ao README](../README.md)

## Requisitos

- Node.js 24, usado como referência para executar os testes que importam `.ts` diretamente. O mínimo declarado no pacote é `>=22.13.0`; versões anteriores do Node podem exigir suporte/flags adicionais para esses testes.
- pnpm **11.25.0**, conforme `packageManager` e o lockfile.
- Git e acesso ao repositório privado.
- Runtime local Cloudflare fornecido pelas dependências Wrangler/Miniflare; não é necessário acessar o D1 de produção para desenvolver ou testar.

Instale a versão indicada de pnpm com seu gerenciador de ferramentas. Se usar Corepack, ele deve respeitar `packageManager`. Não substitua o lockfile por um de npm ou Yarn durante uma instalação comum.

## Preparar o clone

```bash
git clone https://github.com/RomuloLab/fleetops-smg1.git
cd fleetops-smg1
pnpm install --frozen-lockfile
```

Copie [examples/dev.vars.example](examples/dev.vars.example) para `.dev.vars` na raiz. Preencha `LINK_SECRET` e `BETTER_AUTH_SECRET` com valores aleatórios próprios do ambiente local. Para gerar um valor, execute no seu terminal e copie para o arquivo:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Gere um valor diferente para cada segredo. O arquivo `.dev.vars` é ignorado pelo Git. O exemplo contém somente o e-mail fictício usado pela simulação local, sem credenciais de produção.

### Banco local

O arquivo [examples/wrangler.local.jsonc](examples/wrangler.local.jsonc) declara apenas recursos locais e aponta para as migrações do repositório. O ID fictício é o mesmo usado pelo `vite.config.ts`, para que os comandos e o servidor encontrem o mesmo banco local.

```bash
pnpm exec wrangler d1 migrations apply DB --local --config docs/examples/wrangler.local.jsonc --persist-to .wrangler/state
```

O Wrangler apresenta as migrações pendentes e pede confirmação em um terminal interativo. Não acrescente `--remote` a esse comando. Os arquivos SQL são aplicados em ordem e registrados pelo mecanismo de migrações. A seleção inicial de transportadoras/modais é inicializada pela aplicação, separadamente do esquema.

O estado de desenvolvimento fica em `.wrangler/` e não vai para o GitHub. O teste integrado usa outra instância isolada e não precisa desse estado.

### Servidor

```bash
pnpm dev
```

Em um clone comum, `scripts/execution-profile.mjs` seleciona `portable` e o Vinext usa a porta `5173`. Acesse o endereço exibido pelo servidor.

No perfil portátil, o plugin de desenvolvimento oferece uma identidade fictícia **somente em loopback** (`localhost`/`127.0.0.1`): `seedy@sites.test`. Com esse e-mail em `OWNER_EMAIL`, a opção de recuperação do master, ou o caminho local `/signin-with-chatgpt`, estabelece a simulação local. Não representa um login real em conta ChatGPT.

### Limites atuais do desenvolvimento portátil

- Algumas mutações administrativas e o fluxo de e-mail usam `authOrigin()` em [lib/email-security.ts](../lib/email-security.ts). Em desenvolvimento, essa função ainda espera a origem da prévia gerenciada `http://terminal.local:4173`; um clone em `localhost:5173` pode receber 403 nessas operações. Esta documentação não muda essa regra. Para validá-las integralmente, use o teste Worker isolado ou a prévia gerenciada configurada pelo Sites; não remova a proteção de origem em produção.
- O perfil gerenciado desliga a identidade fictícia e usa a infraestrutura de prévia. Suas opções locais ficam em `.sites-runtime/`, fora do Git.
- Microfone depende de suporte do navegador e de contexto considerado seguro. Permissões de hardware e qualidade da voz precisam de conferência no navegador/dispositivo de uso.
- Consultas reais à planilha e chamadas configuradas aos provedores dependem de rede, permissão e saldo. Não configure credenciais de produção apenas para executar os testes.

## Build e execução do Worker

```bash
pnpm build
```

O build produz cliente em `dist/client` e servidor em `dist/server`. O plugin também prepara manifesto/migrações em `dist/.openai`. O perfil gerenciado usa o build limitado de `scripts/build-verified.sh`; o perfil portátil usa a CLI Vinext.

```bash
pnpm start
```

`start` usa Wrangler **local**, o Worker compilado e `.wrangler/state`. Não é um comando de deploy. O build não copia os segredos de produção. A inicialização administrativa de uma implantação própria precisa de bindings, origem e identidade de confiança configurados; a identidade fictícia do Vite não existe no build.

## Verificação

### Tipos e regras sem build

```bash
pnpm exec tsc --noEmit
node scripts/check-model.mjs
node scripts/check-calendarization.mjs
node scripts/check-browser-alerts.mjs
node scripts/check-stela-voice.mjs
node scripts/check-stela-cloud-voice.mjs
node scripts/check-elevenlabs-errors.mjs
node scripts/check-gateway.mjs
node scripts/check-cloudflare-gateway.mjs
```

| Verificação | Cobertura |
| --- | --- |
| `check-model` | Datas, domingo, encerramento, disponibilidade e CSV. |
| `check-calendarization` | CSV FF/SDD, semana/ano, SMG1, placas, aliases e quantidades. |
| `check-browser-alerts` | Feito/não feito, motivos, som, permissões, cursores e reconexão. |
| `check-stela-voice` | Ditado e síntese nativa com eventos/dispositivos simulados. |
| `check-stela-cloud-voice` | Player remoto, cancelamento, cache, autoplay e payload autorizado. |
| `check-elevenlabs-errors` | Códigos modernos/legados, HTTP, cobrança/plano, permissões e descarte de conteúdo privado. |
| `check-gateway` / `check-cloudflare-gateway` | Encaminhamento, origem, segredo e descarte de identidade não confiável. |

### Integração depois do build

```bash
pnpm build
node scripts/check-worker.mjs
```

Esse teste carrega o Worker compilado no Miniflare, aplica todas as migrações em D1 isolado e usa R2 local. Exercita autorização de masters/gestores/transportadoras, cadastros, modais, reenvios, concorrência, placas por veículo, calendarização, convites, sessões, Stela, ElevenLabs e entradas alternativas.

Resend, Google Sheets, OpenAI e ElevenLabs são substituídos por respostas simuladas. Não envia e-mails, não cria pedidos de produção e não gasta créditos reais. Scripts como `check-multi-plates.mjs` e `check-stela-speech.mjs` são etapas importadas pelo teste integrado; não são executáveis independentes.

### Conferência visual

O caminho `/qa-stela-voice` só funciona com `import.meta.env.DEV`. Usa chave fictícia, respostas simuladas e um som curto. Em produção, retorna 404. Não comprova a qualidade de uma voz ElevenLabs real nem o reconhecimento de fala de um dispositivo.

Uma conferência operacional deve incluir data/ciclo, fluxo de pedido, resposta do gestor, reabertura, tema, campos de placas e ativação dos alertas. Testes com provedores reais devem ser explícitos, pois podem enviar mensagens ou consumir créditos.

## Alterar o banco

1. Edite [db/schema.ts](../db/schema.ts).
2. Execute `pnpm db:generate`.
3. Revise os novos arquivos SQL e metadados do Drizzle.
4. Aplique no banco local e execute os testes relevantes.
5. Publique o código junto das migrações pelo fluxo do ambiente.

Não reescreva uma migração que já tenha sido aplicada em produção. Cadastros iniciais e exemplos não devem inserir registros operacionais reais em migrações.

## Dependências e arquivos gerados

`pnpm-lock.yaml`, `pnpm-workspace.yaml` e `.npmrc` preservam a política de instalação. O instalador `pnpm run install:ci` deste projeto usa ferramentas Linux como `bash`, `flock` e `timeout`, próprias do ambiente gerenciado. No clone portátil, use a instalação pnpm indicada acima.

Não versione `node_modules`, `dist`, `.wrangler`, `.sites-runtime`, `.dev.vars`, relatórios locais ou arquivos de credenciais. O `.gitignore` já cobre essas saídas. Preserve as licenças em `vendor/` e no plugin Vite incorporado.
