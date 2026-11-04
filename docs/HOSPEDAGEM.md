# Hospedagem e manutenção

[Voltar ao README](../README.md)

## O que cada repositório e provedor guarda

| Componente | Responsabilidade |
| --- | --- |
| Repositório GitHub | Código-fonte, documentação, migrações, configurações e arquivos estáticos. |
| Repositório de origem do Sites | Fonte usada pelo fluxo gerenciado de versões e publicação. |
| Cloudflare Workers / Sites | Execução do backend e entrega da aplicação original. |
| Cloudflare D1 | Disponibilidade, pedidos, usuários, sessões, configurações cifradas e eventos. |
| Cloudflare R2 | Logos enviadas pelo cadastro. |
| Entrada Vercel | Encaminhamento HTTPS para a instalação original; usa o mesmo backend. |
| Entrada Cloudflare própria | Código em `hosting/cloudflare-gateway`; requer publicação/configuração na conta do proprietário. |
| Registro.br / DNS | Apontamento do domínio próprio; registros de e-mail também pertencem a essa zona. |

Subir o código no GitHub não migra o banco nem ativa um pipeline automático de deploy. O projeto não inclui uma rotina GitHub Actions que publique a aplicação em produção a cada commit.

## Atualizar a instalação gerenciada

O manifesto [`.openai/hosting.json`](../.openai/hosting.json) identifica o Site existente. No fluxo Sites:

1. Abra o projeto existente e confirme o acesso e a versão da fonte.
2. Preserve o `project_id`, os bindings e a audiência já configurada.
3. Faça as alterações e execute as verificações adequadas.
4. Gere o build com a integração Sites/Vinext preservada.
5. Envie o commit exato da fonte ao repositório de origem.
6. Empacote o build desse commit, salve uma versão e publique a versão salva.
7. Confirme o resultado terminal do deploy e seu endereço de produção.

As migrações `drizzle/` acompanham o pacote de publicação. Não use SQL manual para simular um deploy completo, nem crie outro Site para atualizar a instalação atual. Uma mudança somente de documentação pode ser versionada sem alterar o runtime publicado.

O público precisa conseguir abrir o portal, enquanto as APIs administrativas continuam autenticadas. A audiência de publicação do Site e as permissões internas do FleetOps são controles diferentes.

## Build fora do ambiente gerenciado

`pnpm build` gera um Worker e arquivos estáticos. `pnpm start` executa esse Worker **localmente**. Uma instalação independente requer criar/configurar D1 e R2 próprios, aplicar migrações, fornecer segredos e estabelecer o primeiro acesso administrativo de confiança.

A recuperação nativa do master depende de identidade validada pelo Sites. Publicar o Worker fora desse ambiente não cria automaticamente esse mecanismo. Adapte a integração de identidade/primeiro acesso antes de considerar uma implantação independente pronta; não confie em cabeçalhos de identidade enviados diretamente pelo visitante.

Este repositório contém gateways para manter o backend existente. Eles não representam a transferência completa da aplicação para a conta de outro provedor.

## Entrada Vercel e domínio próprio

Consulte [hosting/vercel-gateway/README.md](../hosting/vercel-gateway/README.md). O diretório contém o `vercel.json` da entrada HTTPS. Sua publicação deve usar esse diretório como raiz, em vez de tentar publicar o backend inteiro como uma aplicação Vercel comum.

O token compartilhado fica como segredo nos dois ambientes. O Worker original valida as origens HTTPS explícitas e só então utiliza o host encaminhado para cookies, links e proteção de origem. Login por e-mail funciona nessa entrada; a recuperação nativa volta à origem original.

Ao alterar DNS, use os registros exigidos pelo provedor para o domínio e preserve os registros de e-mail/Resend existentes. DNS resolvido não comprova certificado emitido nem acesso permitido pela rede corporativa. O hostname `www` exige configuração própria quando desejado.

## Entrada Cloudflare própria

Consulte [hosting/cloudflare-gateway/README.md](../hosting/cloudflare-gateway/README.md). O Worker fica fechado até receber `PUBLIC_ORIGIN` e o segredo `GATEWAY_TOKEN`. A instalação original precisa da mesma credencial em `FLEETOPS_CLOUDFLARE_GATEWAY_TOKEN` e da origem exata em `FLEETOPS_CLOUDFLARE_GATEWAY_ORIGIN`.

Essa credencial é independente da Vercel. A nova entrada encaminha diretamente para o backend original, sem passar pela Vercel. O código no repositório não comprova que esse endereço já tenha sido publicado na conta do proprietário.

## Backup e restauração

Código e dados precisam de procedimentos separados:

1. Preserve os commits e as migrações do código que está em produção.
2. Exporte ou use o mecanismo de recuperação do D1 pelo provedor responsável pela instalação.
3. Preserve os objetos R2 e suas referências/enquadramentos no D1.
4. Mantenha cópia protegida dos segredos e a configuração dos domínios, fora do Git.
5. Restaure primeiro em um ambiente separado e valide o acesso, os pedidos e as integrações.

O banco pode conter placas, responsáveis, e-mails, sessões e chaves de serviço cifradas. Não inclua um dump operacional no repositório para fazer backup. Sem o `BETTER_AUTH_SECRET` correspondente, as configurações cifradas restauradas não serão legíveis. Sem o `LINK_SECRET` original, os links já distribuídos não continuarão válidos.

Não há backup automático de D1/R2 implementado por este repositório. A retenção e a recuperação desses serviços são administradas no ambiente de hospedagem.

## Rollback e revisão de alterações

Um rollback de aplicação usa uma versão salva conhecida. Ele não desfaz automaticamente migrações já aplicadas ou decisões registradas no banco. Confira a compatibilidade do código anterior com o esquema atual antes de reverter.

No GitHub, prefira commits claros e atualizações sem sobrescrever histórico concorrente. Para mudanças de regra, descreva o comportamento e as verificações realizadas. Nunca publique valores de `.dev.vars`, tokens de gateway ou chaves de serviços no corpo de um commit/PR.

## Diagnóstico de falhas

| Sintoma | Onde conferir / próxima ação |
| --- | --- |
| `DB` indisponível / tabela ausente | Binding `DB`, manifesto e aplicação de todas as migrações. No clone, confira banco/ID/persistência locais. |
| Link de transportadora inválido | Slug, link gerado pela operação e estabilidade de `LINK_SECRET`. |
| Data bloqueada | Data selecionada e meia-noite em Brasília. O encerramento é uma regra do servidor. |
| Ciclo ausente no domingo | Comportamento esperado para `CPM(CHP)` e `PM`. |
| 409 ao salvar | Outra tela mudou a revisão ou a tentativa foi reutilizada com outro conteúdo; reabra e confira. |
| Modal não disponível | Liberação ativa da transportadora e revisão atual do catálogo. |
| Quantidade/placas recusadas | Uma placa válida e diferente para cada veículo FF; confira pendências e duplicatas. |
| Calendarização indisponível | Acesso CSV à planilha, cabeçalhos, recorte SMG1, datas publicadas e rede do servidor. Reconsulta não deve usar cache vencido como confirmação. |
| E-mail não cadastrado | Usuário ativo cadastrado pelo master; não é cadastro público. |
| Código não chega | Remetente/domínio Resend, chave, estado do envio, eventos do provedor e spam. Aguarde o cooldown antes de reenviar; o novo código invalida o anterior. |
| Voz ElevenLabs `401` | Chave completa/ativa; observe também o código específico, pois alguns erros legados usam esse HTTP para outros motivos. |
| Voz `403` / `missing_permissions` | Escopos Text to Speech e Voices — Ler, acesso à voz e restrições da chave. |
| Voz `402 payment_required` | Disponibilidade da voz via API no plano, saldo e limite da chave. Recarregar créditos não remove restrições de plano. |
| Voz `quota_exceeded` / `insufficient_credits` | Saldo e cota da conta/chave; o limite mensal do FleetOps é outro controle. |
| Voz `429` | Limites locais/provedor; respeite o tempo de espera. |
| Som ou notificação ausente | Ativação, teste, permissão, volume, bloqueio de autoplay e site aberto. |
| Ditado não disponível | Suporte do navegador, contexto seguro e permissão de microfone. O chat por texto continua disponível. |
| 403 em mutação no desenvolvimento portátil | Diferença de origem em `authOrigin()`; consulte o guia de desenvolvimento. |
| Funciona no 5G e é bloqueado na empresa | Mensagem/categoria do bloqueio e política da TI. HTTPS válido não garante liberação de um domínio recém-registrado. |

### Informações úteis para suporte

Registre horário com fuso, endereço da entrada, rota/ação, HTTP e protocolo do pedido quando houver. O diagnóstico sanitizado da ElevenLabs é suficiente para classificar muitos casos; não precisa incluir a chave. Logs de Worker podem conter dados de requisição, portanto extraia somente os campos necessários antes de compartilhar.

### Limites conhecidos

- Notificações não são push em segundo plano com o site fechado.
- Voz e microfone variam conforme navegador/dispositivo; testes automatizados usam simulações.
- IA generativa e ElevenLabs são opcionais e dependem de configuração, permissão, disponibilidade e saldo externos.
- Não existe integração de aceite/atribuição de rotas com sistemas internos do Mercado Livre neste projeto.
- Calendarização é leitura da planilha configurada, somente SMG1; não há escrita automática na fonte.
- A Stela orienta e consulta contexto permitido; não executa decisões de gestão.
