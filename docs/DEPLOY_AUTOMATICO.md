# Publicação automática

[Voltar ao README](../README.md)

## Fluxo

Um push na `main`, incluindo o merge de um PR, inicia o workflow **FleetOps CI and publication**. Ele verifica tipos, regras da operação, alertas, gateways, voz, Worker e banco isolado. Após todos os testes e o build, solicita a publicação ao publicador autorizado do Sites.

O GitHub Actions não recebe segredos de produção. O publicador usa a conexão Sites do proprietário para publicar na instalação existente, preservando D1, R2, usuários, pedidos e variáveis. O job só informa publicação concluída quando o SHA aparece nos dois endereços da aplicação.

| Etapa | Responsável |
| --- | --- |
| Código e gatilho de push | `RomuloLab/fleetops-smg1`, branch `main`. |
| Tipos, testes e build | Job **Validate FleetOps** no GitHub Actions. |
| Solicitação técnica | Job **Publish FleetOps through Sites**, após a validação. |
| Ponte de eventos | Comentário JSON no [rascunho de controle #2](https://github.com/RomuloLab/fleetops-smg1/pull/2). |
| Publicação | Automação ChatGPT com a conexão Sites autorizada pelo proprietário. |
| Confirmação | `/api/fleetops-release` na origem gerenciada e em `fleetops.dev.br`. |

A ponte usa comentários porque a integração de eventos disponível do GitHub acompanha PRs; a publicação do Sites não oferece uma credencial permanente de CI para armazenar no GitHub. Os comentários são solicitações de máquina, não aprovações de código. O publicador valida sua origem e a execução do CI antes de agir.

## Como usar

1. Faça alterações em uma branch e abra um PR quando quiser revisão. O PR executa a validação, sem publicar em produção.
2. Faça o merge na `main`, ou envie um commit diretamente à `main`.
3. Acompanhe **Actions → FleetOps CI and publication**.
4. Aguarde **Publish FleetOps through Sites** confirmar o SHA em produção.

Também existe `workflow_dispatch`, para repetir o fluxo manualmente na `main`. Um commit já publicado é reconhecido. Se chegar um commit mais novo enquanto a execução aguarda, ela pode encerrar como `superseded`; a execução mais nova assume a atualização.

A publicação não é instantânea: inclui execução do CI, acionamento da automação, build/pacote no Sites e verificação dos endereços. O job aguarda até 20 minutos pela confirmação e falha se não puder verificá-la.

## Canal de controle

O PR #2 deve ficar **aberto e em rascunho**. Não deve ser mesclado. A branch `automation/sites-deployment-channel` contém apenas o arquivo técnico que mantém o canal aberto. Ela não fornece o código da produção.

Após a validação, `scripts/request-sites-deployment.mjs` registra um comentário com o marcador `fleetops-sites-deploy-request:v1`, o SHA da `main`, o identificador/tentativa da execução e o caminho do workflow. Nenhuma credencial é adicionada ao corpo. Uma assinatura de eventos, limitada a esse PR e incluindo comentários do bot, aciona o publicador do proprietário.

Não use o canal para comandar alterações no banco, enviar tokens ou solicitar publicação de outras branches. O publicador aceita somente o repositório, branch, workflow e Site fixos desta instalação.

## Verificar a versão

```text
GET https://fleetops.dev.br/api/fleetops-release
GET https://disponibilidade-cpm-chp.shadycharm33.chatgpt.site/api/fleetops-release
```

A resposta pública contém apenas `repository`, `branch`, `commit`, `runId` e `publishedAt`, sem cache. O SHA precisa corresponder ao commit validado. Uma resposta 200 da página inicial ou o comentário de solicitação não comprova que a nova versão foi publicada.

`config/release.json` é um modelo na fonte do GitHub. O publicador preenche seus metadados na cópia usada para a versão gerenciada, antes do build. Essa é a única diferença de conteúdo prevista entre o commit do GitHub e a fonte preparada para publicação; o ID interno do commit Sites é diferente do SHA GitHub.

## Contrato do publicador

A automação tem instruções próprias, com destino fixo. Este documento é uma referência técnica e não amplia sua autorização.

1. Leia a solicitação nova no PR #2. Ignore comentários sem o marcador e eventos que não forem solicitações válidas.
2. Confira autor `github-actions[bot]` ou proprietário `RomuloLab`, repositório, `ref`, SHA de 40 caracteres, ID e tentativa da execução.
3. Consulte a execução real no GitHub. Ela deve ser deste repositório, da `main`, de `push` ou `workflow_dispatch`, no caminho `.github/workflows/fleetops.yml`, com o mesmo SHA/tentativa.
4. Confirme o job **Validate FleetOps** concluído com sucesso. Não confunda o job de publicação ainda em andamento com falha do CI.
5. Confirme que o SHA ainda é o HEAD da `main`. Se for antigo, ignore a solicitação e deixe o CI mais novo assumir.
6. Se os dois endereços já exibirem esse SHA, encerre sem repetir a publicação.
7. Abra o Site `appgprj_6adcee78662c81919e6740bd2e2aefef` pelo helper Sites em um checkout isolado. Confira proprietário/audiência e preserve a instalação e seus recursos.
8. Obtenha o commit público exato do GitHub, restaure sua árvore no índice e no diretório de trabalho desse checkout isolado e confira o manifesto. Não substitua o diretório `.git` nem resete um checkout de trabalho do usuário.
9. Execute `node scripts/prepare-sites-release.mjs SHA RUN_ID`. O script exige que o índice seja exatamente a árvore GitHub, e preserva o ID do Site e os bindings `DB`/`BUCKET`.
10. Prepare dependências se necessário. Verifique tipos e testes apropriados, faça o build com o helper Sites e execute `node scripts/check-worker.mjs`.
11. Confira novamente o HEAD da `main` antes de promover a versão. Se tiver mudado, não publique uma fonte superada.
12. Use o helper para commit/push/pacote da fonte gerenciada. Salve uma versão com o SHA e o arquivo retornados e publique a versão salva, preservando a audiência.
13. Reutilize uma versão salva correspondente em uma retomada quando possível. Não repita deploy de um SHA já confirmado nos dois endereços.
14. Confirme o resultado nativo terminal e leia `/api/fleetops-release` nos dois endereços. Só relate sucesso após a correspondência.

Não há alteração de segredos, cópia de banco ou criação de outro Site neste fluxo. Migrações versionadas acompanham a publicação normal. Falhas deixam a versão anterior atendendo, exceto pelos efeitos de migrações já aplicadas pelo provedor, que devem ser compatíveis com a operação.

## Arquivos e permissões

- `.github/workflows/fleetops.yml`: gatilhos, checks, build e job de publicação.
- `.github/fleetops-deploy.json`: destino, origens e canal de controle; sem segredos.
- `scripts/request-sites-deployment.mjs`: preflight, solicitação e confirmação do SHA.
- `scripts/prepare-sites-release.mjs`: conferência da árvore/manifesto e metadados da versão.
- `scripts/check-deployment.mjs`: testes sem serviços reais.
- `app/api/fleetops-release/route.ts`: metadados públicos da versão.

O job de validação recebe somente leitura de conteúdo. O job de solicitação usa o `GITHUB_TOKEN` efêmero, com `contents: read` e `pull-requests: write`, necessário para registrar o comentário no PR de controle. O script limita o destino ao PR configurado. Ele não recebe chaves Resend, ElevenLabs, Cloudflare, sessões ou segredo de portais. PRs de forks não executam o job de publicação.

Os nomes do workflow/job, o formato do comentário e o PR de controle fazem parte do contrato. Para alterá-los, atualize também a automação; não feche o canal durante uma publicação.

## Diagnóstico

| Situação | Ação |
| --- | --- |
| `Validate FleetOps` falhou | Corrija o erro indicado e envie outro commit. Nenhuma solicitação será enviada por esse run. |
| Canal fechado ou deixou de ser draft | Restaure o PR de controle para aberto/rascunho e repita o fluxo. |
| Falha ao comentar, HTTP 403 | Confira as permissões do Actions e o `pull-requests: write` do job, sem ampliar acesso de forks. O erro informa método e rota para distinguir consulta e escrita. |
| Solicitação enviada, sem deploy | Confira se a automação do proprietário está ativa e conectada ao GitHub, Sites e ambiente de execução. |
| `superseded` | Existe outro SHA na `main`; acompanhe a execução mais nova. |
| Timeout do job | Confira o resultado da automação e os dois endpoints de versão. Um endpoint antigo/indisponível impede confirmar a publicação. |
| Nova hospedagem/novo domínio | Atualize o contrato/configuração e teste os dois endereços antes de mudar o fluxo ativo. |

Para pausar, desative a automação de publicação e o workflow, ou pause o job de publicação por uma alteração revisada. Validação isolada não publica o site. Não adicione segredos permanentes ao repositório para contornar uma conexão indisponível.
