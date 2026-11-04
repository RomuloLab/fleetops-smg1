# Configuração e integrações

[Voltar ao README](../README.md)

## Ambiente e bindings

As variáveis são lidas no Worker, por `cloudflare:workers`. Em produção, use o armazenamento de segredos do provedor. No desenvolvimento, use `.dev.vars` local, fora do Git. [cloudflare-env.d.ts](../cloudflare-env.d.ts) descreve os nomes reconhecidos pelo aplicativo.

| Nome | Necessidade | Finalidade |
| --- | --- | --- |
| `DB` | Obrigatório | Binding Cloudflare D1; esquema em `db/schema.ts`. |
| `BUCKET` | Para logos enviadas | Binding R2; recebe arquivos cadastrados pela ferramenta. |
| `OWNER_EMAIL` | Obrigatório para o master principal | E-mail protegido da conta proprietária da operação. |
| `BETTER_AUTH_SECRET` | Obrigatório para login/e-mail/voz | Segredo estável de pelo menos 32 caracteres; sessões, proteção de códigos e criptografia das chaves de serviços. |
| `LINK_SECRET` | Obrigatório para portais | Assina os acessos individuais das transportadoras. |
| `AUTH_BASE_URL` | Produção | Origem HTTPS exata da instalação original, sem caminhos. |
| `OPENAI_API_KEY` | Opcional | Ativa a integração generativa da Stela. Ausente, usa a base de ajuda. |
| `STELA_MODEL` | Opcional | Modelo da IA; fallback no código: `gpt-5.4-mini`. |
| `FLEETOPS_GATEWAY_TOKEN` | Se houver entrada Vercel | Segredo compartilhado entre o gateway e o Worker original. |
| `FLEETOPS_GATEWAY_ORIGINS` | Se houver entrada Vercel | Origens HTTPS permitidas, separadas por vírgula. |
| `FLEETOPS_GATEWAY_ORIGIN` | Compatibilidade | Uma origem, quando a lista acima não estiver configurada. |
| `FLEETOPS_CLOUDFLARE_GATEWAY_TOKEN` | Se houver nova entrada Cloudflare | Segredo independente da entrada Vercel. |
| `FLEETOPS_CLOUDFLARE_GATEWAY_ORIGIN` | Se houver nova entrada Cloudflare | Origem HTTPS exata retornada pela publicação desse gateway. |

No manifesto [`.openai/hosting.json`](../.openai/hosting.json), `d1` e `r2` indicam os bindings `DB` e `BUCKET`. O `project_id` identifica a instalação existente: preserve-o em atualizações.

### Estabilidade dos segredos

- Trocar `LINK_SECRET` invalida os links de transportadora já distribuídos.
- Trocar `BETTER_AUTH_SECRET` afeta sessões e a leitura das chaves cifradas do Resend e da ElevenLabs; essas integrações precisam ser reconfiguradas.
- `OWNER_EMAIL` define o master principal. Alterá-lo é uma transferência de acesso administrativo.
- Chaves Resend e ElevenLabs são configuradas na interface e cifradas no D1. Não são variáveis públicas nem arquivos do repositório.

O clone não contém os valores de produção. Para um novo ambiente, gere segredos próprios; para restaurar o ambiente existente, recupere os valores por seu procedimento de manutenção.

## Primeiro acesso administrativo

Na instalação Sites, configure `OWNER_EMAIL`, `BETTER_AUTH_SECRET`, `LINK_SECRET` e a origem. Com o banco migrado, entre pela recuperação nativa do master principal na origem original. Esse acesso depende da identidade validada pelo Sites; não existe senha padrão no código.

No painel **Usuários**, configure o remetente e crie os gestores. Convites e login por e-mail ficam disponíveis após o serviço de envio estar pronto. O ambiente portátil tem uma identidade fictícia somente local; veja [Desenvolvimento](DESENVOLVIMENTO.md).

## E-mail com Resend

1. Verifique o domínio remetente no Resend e conclua os registros DNS exigidos pelo serviço.
2. Entre como master em **Usuários → Configuração de e-mail**.
3. Informe o endereço remetente desse domínio e a chave de envio.
4. Salve e use **Enviar teste** para conferir o recebimento.
5. Cadastre um gestor ativo e verifique o convite e o login por código.

A aplicação registra pendência, falha, aceite e envio não confirmado. Um aceite do Resend não comprova entrega ao destinatário. Verifique os eventos do provedor e a caixa de spam quando necessário.

O remetente não exige que os gestores usem o mesmo domínio: endereços Gmail, Outlook, Hotmail e corporativos podem ser cadastrados. A verificação é feita pelo código enviado ao endereço cadastrado. Sem remetente configurado, novos convites aguardam configuração.

## Calendarização SMG1

A fonte e seus aliases ficam em [config/calendarization.ts](../config/calendarization.ts). As abas usadas são FF (`801104757`) e SDD (`1533539391`), restritas à unidade `SMG1`.

O servidor consulta projeções CSV somente leitura:

| Tipo | Recorte e conferência |
| --- | --- |
| FF | Quadro A:S, `Facility final = SMG1`; placa, transportadora/MLP, Cadastro Final, semana, dia e ciclo. |
| SDD | Quadro A:N, `Saída LM = SMG1`; datas reais dos cabeçalhos F:L e quantidade por transportadora/modal/ciclo. |

O parser confere cabeçalhos, base e limites de tamanho. O quadro auxiliar de pedidos à direita da SDD não é somado. Nomes conhecidos podem usar os aliases configurados; novos nomes precisam coincidir após a normalização, ou receber um alias conferido na fonte.

O cache D1 vale até 60 segundos e guarda somente a projeção SMG1. Reconsulta força uma nova leitura. Falha de acesso não utiliza cache vencido como confirmação nem muda o status administrativo do pedido.

A planilha precisa permitir o acesso CSV usado pelo servidor. A instalação não utiliza automaticamente a sessão Google do navegador nem a conexão Google Drive do usuário no ChatGPT. Se a fonte ficar privada ou mudar de formato, a aplicação informa indisponibilidade.

## Stela e voz

### Base de ajuda e IA generativa

[lib/stela-knowledge.ts](../lib/stela-knowledge.ts) contém o guia versionado e as sugestões por perfil. O servidor monta contexto permitido para cada chamada. Sem `OPENAI_API_KEY`, a Stela permanece no modo **Base de ajuda**.

A integração generativa opcional usa AI SDK e OpenAI Responses. O modelo é definido por `STELA_MODEL` ou pelo fallback do código. Configure uma conta e um modelo disponíveis para seu ambiente antes de ativar. A voz ElevenLabs não ativa a IA generativa.

O provedor recebe guia, contexto autorizado e histórico limitado, com `store=false`. Há limites por usuário/transportadora e por dia, timeout e retorno identificado à base de ajuda em falhas. A Stela não tem ferramentas de escrita, navegação livre ou aprovação de pedidos.

### Ditado e voz do dispositivo

O microfone usa `SpeechRecognition`/`webkitSpeechRecognition` em `pt-BR`, após clique e permissão. O texto fica para revisão antes de enviar. O ditado depende do navegador e de contexto seguro; alguns navegadores usam processamento externo próprio.

O FleetOps não grava arquivos do microfone. Sem ElevenLabs ativa, a leitura usa as vozes disponíveis no navegador, priorizando português brasileiro. Minimizá-la, ocultar a guia ou começar outro ditado interrompe a leitura.

### ElevenLabs

1. Crie uma chave restrita com **Text to Speech — Acesso** e **Voices/Vozes — Ler**.
2. Como master, abra **Stela → Configurar voz**.
3. Cadastre a chave e salve; a validação consulta o catálogo da conta.
4. Use **Carregar vozes**, selecione a voz e salve novamente.
5. Use **Testar voz salva** e confira a qualidade. Esse teste gera áudio e pode consumir créditos.
6. Marque **Ativar ElevenLabs nos dois painéis** e salve. Nos demais painéis já abertos, reabra a Stela para atualizar sua configuração.

A chave é cifrada com AES-GCM e uma derivação exclusiva do segredo da aplicação. A API não devolve a chave nem seu conteúdo cifrado. O modelo usado é `eleven_multilingual_v2`, com MP3 a 44,1 kHz e 128 kbps.

Somente texto de respostas autorizadas e assinadas pela Stela, ou a frase fixa de teste, pode gerar áudio. A assinatura expira em uma hora e depende do perfil e das permissões atuais. Há limite por minuto e reserva mensal atômica de caracteres. O padrão de 5.000 é um teto de uso da aplicação; tentativas também contam. O limite de créditos da chave e o saldo da conta ElevenLabs são independentes desse contador.

`402 payment_required` pode indicar cobrança ou restrição da voz ao plano, além de saldo. Vozes da Voice Library não estão disponíveis via API no plano gratuito; saldo PAYG não remove uma restrição de plano. Confira as condições atuais da conta antes de contratar ou recarregar.

Falhas exibem o HTTP e identificadores conhecidos, sem repassar mensagens privadas. O log `stela.elevenlabs.failure` contém somente etapa, HTTP e código conhecido. No navegador há cache temporário limitado a seis áudios/8 MiB; fechar ou trocar o contexto interrompe geração e reprodução. Não há promessa de retenção zero no provedor: o tratamento dos textos depende das configurações da conta ElevenLabs.

## Marca e parâmetros iniciais

| Arquivo | Alteração |
| --- | --- |
| [config/brand.ts](../config/brand.ts) | Nome e apresentação da ferramenta. |
| [lib/model.ts](../lib/model.ts) | Transportadoras iniciais, ciclos e regras gerais. |
| [config/carrier-logos.ts](../config/carrier-logos.ts) | Associação das logos estáticas por slug. |
| [config/carrier-modals.ts](../config/carrier-modals.ts) | Oito modais originais da ALC e sua ordem. |
| [config/ambulance-releasers.ts](../config/ambulance-releasers.ts) | Lista autorizada de liberadores. |
| [config/calendarization.ts](../config/calendarization.ts) | Fonte SMG1 e aliases conferidos. |

Cadastros feitos pela aplicação são duráveis no D1; editar uma configuração inicial não substitui a administração das liberações já salvas.
