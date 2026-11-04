# Guia de operação

[Voltar ao README](../README.md)

## Acessar o painel

O gestor acessa `/` ou `/login`, informa o e-mail cadastrado e confirma o código recebido. Novas solicitações têm intervalo de 50 segundos e invalidam o código anterior. O código expira em dez minutos.

**Manter conectado** cria uma sessão persistente de até 30 dias. Sem essa opção, o cookie vale para a sessão do navegador, com validade máxima de 24 horas no servidor. Sair revoga a sessão atual. Bloqueios e permissões são conferidos em cada operação.

| Aba | Permissão | Finalidade |
| --- | --- | --- |
| Visão geral | `dashboard` | Disponibilidade, responsáveis, quantidades e CSV. |
| Scheduling | `scheduling` | Pedidos, decisões, calendarização e alertas. |
| Links de coleta | `links` | Links e mensagens específicos das transportadoras. |
| Cadastro | `registration` | Transportadoras, logos, catálogo e liberações de modais. |
| Usuários | Master | Gestores, masters, permissões e remetente de e-mail. |
| Configuração da voz | Master | Chave, voz e ativação da ElevenLabs. |

Masters têm acesso completo. O master principal vem de `OWNER_EMAIL` e é protegido contra alteração pelo cadastro. Outros usuários podem ser promovidos a master. Gestores comuns não se promovem nem administram usuários.

## Disponibilidade e links

1. Selecione a data e o ciclo no painel.
2. Em **Links de coleta**, copie a mensagem ou abra o portal da transportadora.
3. A transportadora informa utilitários, vans, VUCs, outros veículos, responsável e observações. Se não houver veículos, confirma essa condição.
4. O envio aparece na visão geral. Uma nova confirmação válida atualiza a resposta da mesma transportadora/data/ciclo.
5. Exporte o CSV do recorte selecionado quando necessário.

O CSV usa `;`, BOM UTF-8 e proteção para células que poderiam ser interpretadas como fórmulas. Totais e pendências reconhecem também as transportadoras cadastradas pela ferramenta.

Cada portal usa um link exclusivo que funciona como credencial. Ele oferece **Disponibilidade** e **Scheduling** e consulta somente os registros daquela transportadora. Solicite à operação o link correspondente em vez de substituir o nome da transportadora no endereço.

### Datas e ciclos

- Ordem: `CPM(CHP)`, `AM`, `PM`, `SD`, `SDE`.
- Aos domingos: somente `AM`, `SD` e `SDE`.
- Fuso: `America/Sao_Paulo`.
- Após a virada da data selecionada, disponibilidade e novos pedidos ficam somente para consulta.
- O servidor e a gravação no banco conferem o prazo; o relógio do dispositivo não amplia a janela.

O contador semanal usa a semana corrente de segunda a domingo em Brasília. Ele não confirma a publicação de uma semana na planilha. A consulta externa usa a data/semana do pedido.

## Fazer um pedido de Scheduling

1. Escolha data e ciclo.
2. Selecione um modal liberado para sua transportadora.
3. Preencha quantidade, responsável e observações.
4. Se for frota fixa, informe uma placa válida e diferente para cada veículo.
5. Se for ambulância, marque a opção e selecione quem liberou.
6. Envie e confira o protocolo e o status **Pendente**.

Reenvios da mesma tentativa são reconhecidos. Após uma falha de conexão, confira a lista antes de iniciar outro pedido.

### Placas e ambulância

São aceitos os formatos `ABC1234` e `ABC1D23`, normalizados para comparação. A quantidade de placas deve corresponder exatamente à quantidade de veículos. Placas repetidas no mesmo pedido são rejeitadas.

O formulário exibe seis veículos por página, permite colar uma lista e indica progresso e pendências. Um pedido com 15 veículos exige 15 placas. O fluxo não se limita a dois campos nem a 15 veículos; os limites de entrada da API continuam aplicáveis.

O liberador só aparece e é obrigatório quando **Ambulância** está marcada. Os nomes autorizados estão em [config/ambulance-releasers.ts](../config/ambulance-releasers.ts). A marcação e o liberador ficam salvos no pedido e aparecem nos dois painéis.

## Concluir pedidos

| Status | Quem define | Resultado |
| --- | --- | --- |
| Pendente (`pending`) | Aplicação, no envio | Aguarda decisão do gestor. Registros antigos `received` são apresentados como pendentes. |
| Feito (`done`) | Gestor autorizado | Salva a conclusão e notifica a transportadora. |
| Não feito (`not_done`) | Gestor autorizado | Exige motivo e notifica explicitamente que o pedido não foi feito. |

A observação da transportadora e a observação de conclusão são campos diferentes. O motivo de não feito admite até 1.000 caracteres e aparece no painel geral, nos detalhes e nos informativos do portal.

O gestor pode registrar a decisão depois do encerramento da data, sem reabrir o envio original. Decisão e evento são gravados na mesma transação. Se outra tela alterou o pedido, reabra os detalhes para conferir a revisão atual.

## Conferir calendarização SMG1

O modal é configurado em **Cadastro → Base de modais**:

- **FF:** frota fixa; conferência por placa, transportadora, modal, semana, dia e ciclo.
- **SDD:** quantidade por transportadora, modal, data e ciclo; a fonte SDD não contém placas.
- **Sem consulta:** não se aplica consulta externa ao modal.

**Nome do modal na planilha** associa nomes diferentes; vazio, utiliza o nome do cadastro. O pedido preserva a configuração usada no envio.

A consulta começa após salvar o pedido pendente. O resultado não substitui a decisão do gestor: calendarização conferida não marca o pedido como feito; fonte indisponível não o reprova. Use **Reconsultar planilha** para solicitar nova leitura.

O resultado distingue período não publicado, folga, placa ausente, transportadora/modal/ciclo divergentes, quantidade excedida, conflito de dados e fonte indisponível. Somente SMG1 participa da conferência.

## Cadastrar transportadoras e modais

Em **Cadastro → Transportadoras**, informe nome e, opcionalmente, logo PNG/JPG/WebP de até 2 MB. A aplicação prepara o enquadramento, salva e apresenta o link do novo portal. Sem imagem, usa as iniciais.

Em **Base de modais**, cadastre o nome geral e defina frota fixa ou SDD quando aplicável. Depois selecione os modais de cada transportadora. É possível retirar todos. A retirada bloqueia novos pedidos e preserva os anteriores.

As transportadoras iniciais ficam em [lib/model.ts](../lib/model.ts), e os oito modais originais da ALC em [config/carrier-modals.ts](../config/carrier-modals.ts). A inicialização não reativa liberações removidas pelo gestor.

## Ativar alertas

Use **Ativar alertas**, conceda a permissão e teste o som. A preferência é salva separadamente para gestor e cada transportadora. A aplicação informa quando o áudio precisa ser reativado.

O gestor acompanha novos pedidos a cada cinco segundos enquanto o site está aberto, inclusive em outras abas do painel. A transportadora acompanha as decisões dos próprios pedidos. Feito e Não feito geram avisos distintos; o não feito inclui o motivo.

O primeiro acesso estabelece um cursor e não reproduz todo o histórico. O cursor da guia, válido por até 24 horas, ajuda a recuperar eventos ainda não vistos após recarga/reconexão. O navegador pode suspender áudio e atrasar consultas em segundo plano. Não há push com o site fechado.

## Usar a Stela

Abra a Stela em qualquer um dos dois perfis. Sugestões e contexto seguem as permissões do usuário. É possível digitar, ditar com revisão antes do envio, ouvir, interromper a leitura e iniciar outra conversa.

**Base de ajuda** identifica o modo sem IA generativa. A Stela consulta contexto autorizado e orienta; não cadastra, aprova ou altera pedidos por conta própria. A conversa fica em memória da página.

A voz do dispositivo depende do navegador. ElevenLabs depende da configuração do master e das condições da conta do provedor. Veja [Configuração](CONFIGURACAO.md#stela-e-voz).
