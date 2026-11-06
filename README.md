# n8n-nodes-rd-station-marketing

Node community do [n8n](https://n8n.io/) para integrar seus fluxos com o **[RD Station Marketing](https://www.rdstation.com/produtos/marketing/)**.

O pacote cobre as rotas de dados do Marketing que a RD documenta em [developers.rdstation.com](https://developers.rdstation.com): contatos, campos personalizados, funil, segmentações, fluxos de automação, e-mails, landing pages, popups, formulários, campanhas, analytics, eventos, catálogo de produtos e webhooks. Ele tem um node de ação e um node gatilho (trigger) que cadastra e remove o webhook na RD sozinho.

O RD Station CRM e o RD Station Conversas são produtos com APIs próprias e ficam em outros pacotes. Para o CRM, use o [`n8n-nodes-rd-station-crm`](https://www.npmjs.com/package/n8n-nodes-rd-station-crm).

## Funcionalidades

- **Um node de ação** — `RD Station Marketing`, com seletor Recurso → Operação e uso como ferramenta de IA (`usableAsTool`).
- **Um gatilho de verdade** — `RD Station Marketing Trigger` cadastra o webhook ao ativar o workflow e o apaga ao desativar.
- **Listas pesquisáveis** — segmentações, fluxos, e-mails, campanhas, catálogos, webhooks e campos personalizados vêm da sua conta. Você escolhe pelo nome ou cola o ID.
- **Return All e Limit** — as listagens paginam sozinhas, e a saída é um item do n8n por registro, sem o envelope da RD.
- **Zero dependências de runtime** — só o `n8n-workflow` do próprio n8n. Toda requisição leva timeout de 30 s.

## Instalação

Siga o [guia de community nodes](https://docs.n8n.io/integrations/community-nodes/installation/) do n8n. No n8n, vá em **Settings → Community Nodes → Install** e digite:

```
n8n-nodes-rd-station-marketing
```

## Credenciais

O pacote tem duas credenciais. A de OAuth2 serve todas as operações e o gatilho. A de chave de API serve só o envio de conversão.

### 1. RD Station Marketing OAuth2 API

1. Entre na [App Store da RD](https://appstore.rdstation.com/pt-BR/publisher) e crie um aplicativo.
2. Copie o **Client ID** e o **Client Secret**.
3. No n8n, crie a credencial **RD Station Marketing OAuth2 API** e cole os dois valores. O n8n mostra o **OAuth Redirect URL**.
4. Cadastre esse endereço como `redirect_uri` no aplicativo da RD. A RD leva até 1 hora para aplicar a mudança.
5. Clique em **Connect** e autorize a conta.

> **Atenção:** a RD documenta a renovação do token (`refresh_token`) em JSON, e o n8n renova no formato padrão do OAuth2. Essa compatibilidade ainda não foi confirmada com uma conta real. Se o token expirar e o n8n não renovar, reconecte a credencial e abra uma issue.

### 2. RD Station Marketing API (chave de API)

1. Na App Store da RD, use **Gerar chave de API** (perfil Gestor ou Dono).
2. No n8n, crie a credencial **RD Station Marketing API** e cole a chave.

A RD só aceita a chave de API em `POST /platform/conversions`. Por isso o campo **Authentication** só aparece em **Event → Send Conversion**.

## Recursos e Operações

Em todas as operações com ID, o campo abre em **From list** com busca, e você pode trocar para **By ID**. Todo Delete devolve `{ "deleted": true }`.

| Recurso         | Operações                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact         | Get, Create, Update, Delete, Add Tags, Get Events                                                                                                         |
| Custom Field    | Get Many, Create, Update, Delete                                                                                                                          |
| Funnel          | Get, Update                                                                                                                                               |
| Segmentation    | Get Many, Get Contacts                                                                                                                                    |
| Automation Flow | Get Many, Get, Add Leads, Get Leads Started, Get Leads Left, Get Action Executed                                                                          |
| Email           | Get Many, Get                                                                                                                                             |
| Landing Page    | Get Many                                                                                                                                                  |
| Popup           | Get Many                                                                                                                                                  |
| Form            | Get Many                                                                                                                                                  |
| Campaign        | Get Many, Get, Get Items                                                                                                                                  |
| Analytics       | Get Emails, Get Workflow Emails, Get Funnel, Get Conversions                                                                                              |
| Event           | Send Conversion, Mark Opportunity, Mark Sale, Mark Lost Opportunity, Send Chat Event, Send Call Finished, Send Media Event, Send Custom Event, Send Batch |
| Product Catalog | Get Many, Get, Create, Update, Delete                                                                                                                     |
| Webhook         | Get Many, Get, Create, Update, Delete                                                                                                                     |

Pontos que mudam o resultado:

- **Contact → Update** com tags **substitui** todas as tags do contato. Use **Add Tags** para acrescentar.
- **Contact → Update** por e-mail não envia o campo `email`, porque a RD o recusa nesse caso.
- **Campos personalizados (`cf_*`)** entram em Contact (Create e Update) e em Send Conversion. A RD só documenta `cf_*` nas conversões; se ela recusar em contatos, o erro dela aparece no node.
- **Datas** de Analytics e dos relatórios de leads usam só o dia (`YYYY-MM-DD`).
- **Campanhas** existem nos planos Pro e Advanced. Em outros planos a RD responde 403 ou 404, e o erro avisa.
- **Eventos descontinuados** (`ORDER_PLACED`, `CART_ABANDONED` e seus itens) não existem aqui. Use os eventos `ECOMMERCE_*` em **Send Custom Event**.
- **Limites da RD** (por exemplo, 40 requisições por hora na lista de fluxos) valem. No erro 429, o node diz quantos segundos esperar.

### Gatilho

O node **RD Station Marketing Trigger** escolhe o evento: **Converted** ou **Marked as Opportunity**. Em **Converted** você pode filtrar por identificadores de conversão, e em **Include Relations** pede a empresa e o funil do contato.

- Ao ativar o workflow, o node chama `POST /integrations/webhooks` com a URL de produção do n8n e guarda o `uuid` do webhook.
- Ao desativar, chama `DELETE /integrations/webhooks/{uuid}`.
- A RD só aceita URL HTTPS pública que responda com 2xx. Em `localhost` o cadastro falha com orientação.
- A RD tenta 3 vezes mais quando o destino demora mais de 5 s e não assina o corpo. O payload não traz id de entrega: para evitar duplicidade, use `contact.uuid` com `event_timestamp` como chave.
- Os webhooks criados por API não aparecem no painel do RD Marketing.

## Exemplos

### Registrar uma conversão com campo personalizado

1. Adicione o node **RD Station Marketing** e escolha **Event → Send Conversion**.
2. Preencha **Conversion Identifier** (`newsletter`) e **Email**.
3. Em **Custom Fields**, escolha o campo (`cf_plano`) e o valor (`Pro`).
4. Para usar a chave de API, troque **Authentication** para **API Key**.

### Ler todas as segmentações

1. Escolha **Segmentation → Get Many** e ligue **Return All**.
2. O node pagina de 125 em 125 e devolve um item por segmentação.

### Receber conversões da newsletter

1. Adicione **RD Station Marketing Trigger**, evento **Converted**, e `newsletter` em **Conversion Identifiers**.
2. Ative o workflow. O webhook nasce na RD.
3. Cada conversão chega como um item com `contact`, `event_identifier` e `event_timestamp`.

## Desenvolvimento

```bash
# Instalar dependências
npm install --ignore-scripts

# Compilar (n8n-node build)
npm run build

# Testes: compila e roda node --test sobre o dist
npm test

# Lint oficial do n8n
npm run lint
```

### Testar localmente com `npm run dev`

O `npm run dev` roda `n8n-node dev`: ele sobe um n8n local com este pacote carregado e recompila a cada mudança.

1. Rode `npm run dev` na raiz do repositório e abra o endereço que o comando mostra.
2. Crie a credencial **RD Station Marketing OAuth2 API** com o Client ID e o Client Secret do seu aplicativo. Cadastre o `OAuth Redirect URL` que o n8n mostrar no aplicativo da RD.
3. Conecte a conta e rode **Custom Field → Get Many**, **Contact → Get** e **Segmentation → Get Many**.
4. Deixe o workflow rodar por mais de 24 horas, ou apague o token no n8n, para confirmar a renovação automática do token.
5. Em **Contact → Create**, preencha um **Custom Field** e confira se a RD aceita os campos `cf_*`.

A tag `v1.0.0` só deve sair depois desse teste com conta real (decisão AD-011 em `.specs/STATE.md`). O workflow `publish.yml` publica no npm quando uma tag `v*.*.*` chega ao GitHub, com provenance.

## Compatibilidade

Testado com o `n8n-workflow` 2.16 e o `@n8n/node-cli` 0.55.5. O pacote declara `n8nNodesApiVersion` 1.

## Recursos

- [Documentação da API do RD Station Marketing](https://developers.rdstation.com)
- [Community nodes do n8n](https://docs.n8n.io/integrations/#community-nodes)

## Licença

[MIT](LICENSE.md)
