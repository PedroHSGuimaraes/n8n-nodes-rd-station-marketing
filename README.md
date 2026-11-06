# @pexuleco/n8n-nodes-rd-station-marketing

Node community do [n8n](https://n8n.io/) para integrar seus fluxos com o **[RD Station Marketing](https://www.rdstation.com/produtos/marketing/)**.

[![Apoie no Buy Me a Coffee](https://img.shields.io/badge/Buy_Me_a_Coffee-Apoie_o_projeto-FFDD00?logo=buy-me-a-coffee&logoColor=000000)](https://buymeacoffee.com/qTny0AzFXS)

O RD Station Marketing é a plataforma de automação de marketing usada para gerenciar leads, segmentações, fluxos de automação, e-mails e conversões. O pacote cobre as rotas de dados do Marketing que a RD documenta em [developers.rdstation.com](https://developers.rdstation.com): contatos, campos personalizados, funil, segmentações, fluxos de automação, e-mails, landing pages, popups, formulários, campanhas, analytics, eventos, catálogo de produtos e webhooks. Ele tem um node de ação e um node gatilho (trigger) que cadastra e remove o webhook na RD sozinho.

O RD Station CRM e o RD Station Conversas são produtos com APIs próprias e ficam em outros pacotes. Para o CRM, use o [`n8n-nodes-rd-station-crm`](https://www.npmjs.com/package/n8n-nodes-rd-station-crm).

[n8n](https://n8n.io/) é uma plataforma de automação de fluxos com [licença fair-code](https://docs.n8n.io/reference/license/).

[Instalação](#-instalação) · [Credenciais](#-credenciais) · [Recursos e Operações](#-recursos-e-operações) · [Exemplos](#-exemplos) · [Gatilho](#-gatilho) · [Tool de IA](#-usar-como-tool-de-agente-de-ia) · [Desenvolvimento](#️-desenvolvimento) · [Versões](#-versões) · [Suporte](#-suporte) · [Apoie](#-apoie-o-projeto)

---

## 🚀 Funcionalidades

- **Um node de ação** — `RD Station Marketing`, com seletor **Recurso → Operação** e 14 recursos.
- **Um gatilho de verdade** — `RD Station Marketing Trigger` cadastra o webhook ao ativar o workflow e o apaga ao desativar.
- **Duas credenciais** — OAuth2 para todas as operações e o gatilho. Chave de API só para o envio de conversão.
- **Listas pesquisáveis** — segmentações, fluxos, e-mails, campanhas, catálogos, webhooks e campos personalizados vêm da sua conta. Você escolhe pelo nome ou cola o ID.
- **Return All e Limit** — as listagens paginam sozinhas, e a saída é um item do n8n por registro, sem o envelope da RD.
- **Erros claros** — os erros 401, 429 e 400 da RD viram mensagens com a ação sugerida. As validações (e-mail ou telefone, datas, JSON) falham antes da requisição.
- **Usável como Tool de IA** — o node tem `usableAsTool: true`, então um **AI Agent** do n8n pode chamar as operações. Veja [Usar como Tool de Agente de IA](#-usar-como-tool-de-agente-de-ia).
- **Zero dependências de runtime** — só o `n8n-workflow` do próprio n8n. Toda requisição leva timeout de 30 s.

## 📦 Instalação

Siga o [guia de community nodes](https://docs.n8n.io/integrations/community-nodes/installation/) do n8n.

No n8n, vá em **Settings → Community Nodes → Install** e digite:

```
@pexuleco/n8n-nodes-rd-station-marketing
```

> Requer uma instância n8n com `n8nNodesApiVersion` 1.

O pacote tem escopo `@pexuleco` porque o npm recusa o nome sem escopo: já existe o `n8n-nodes-rdstation-marketing`, de outra pessoa, e sem a pontuação os dois nomes ficam iguais.

## 🔑 Credenciais

O pacote tem duas credenciais. A de OAuth2 serve todas as operações e o gatilho. A de chave de API serve só o envio de conversão.

### 1. RD Station Marketing OAuth2 API

1. Entre na [App Store da RD](https://appstore.rdstation.com/pt-BR/publisher) e crie um aplicativo.
2. Copie o **Client ID** e o **Client Secret**.
3. No n8n, crie a credencial **RD Station Marketing OAuth2 API** e cole os dois valores. O n8n mostra o **OAuth Redirect URL**.
4. Cadastre esse endereço como `redirect_uri` no aplicativo da RD. A RD leva até 1 hora para aplicar a mudança.
5. Clique em **Connect** e autorize a conta.

> ⚠️ A RD documenta a renovação do token (`refresh_token`) em JSON, e o n8n renova no formato padrão do OAuth2. Essa compatibilidade ainda não foi confirmada com uma conta real. Se o token expirar e o n8n não renovar, reconecte a credencial e abra uma issue.

### 2. RD Station Marketing API (chave de API)

1. Na App Store da RD, use **Gerar chave de API** (perfil Gestor ou Dono).
2. No n8n, crie a credencial **RD Station Marketing API** e cole a chave.

A RD só aceita a chave de API em `POST /platform/conversions`. Por isso o campo **Authentication** só aparece em **Event → Send Conversion**.

## 🧩 Recursos e Operações

O pacote traz **um node de ação** (`RD Station Marketing`) com seletor **Recurso → Operação** e **um node de gatilho** (`RD Station Marketing Trigger`).

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

## 💡 Exemplos

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

## 🔔 Gatilho

O node **RD Station Marketing Trigger** inicia um fluxo quando um evento acontece no RD Station Marketing. Em **Event**, escolha **Converted** ou **Marked as Opportunity**. Em **Converted** você pode filtrar por identificadores de conversão, e em **Include Relations** pede a empresa (`Company`) e o funil (`Contact Funnel`) do contato.

> O gatilho usa só a credencial **OAuth2**. A chave de API não serve ao gatilho.

- Ao ativar o workflow, o node chama `POST /integrations/webhooks` com a URL de produção do n8n e guarda o `uuid` do webhook.
- Ao desativar, chama `DELETE /integrations/webhooks/{uuid}`.
- A RD só aceita URL HTTPS pública que responda com 2xx. Em `localhost` o cadastro falha com orientação.
- Os webhooks criados por API não aparecem no painel do RD Marketing.

> **Dica:** a RD tenta 3 vezes mais quando o destino demora mais de 5 s e não assina o corpo. O payload não traz id de entrega: para evitar duplicidade, use `contact.uuid` com `event_timestamp` como chave.

## 🤖 Usar como Tool de Agente de IA

O node `RD Station Marketing` é **usável como tool** por nós de **AI Agent** do n8n (Tools Agent). Isso deixa o modelo **executar ações no seu RD Marketing sozinho** — por exemplo: *"registre uma conversão `newsletter` para maria@empresa.com"*.

### Como ligar (2 passos)

1. **No servidor n8n**, habilite o uso de community nodes como tools (por segurança, vem **desligado por padrão**). Defina a variável de ambiente:

   ```bash
   N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
   ```

   | Instalação | Onde definir |
   | --- | --- |
   | **Docker / docker-compose** | Adicione em `environment:` do serviço n8n (ou no `.env`) e recrie o container (`docker compose up -d`). |
   | **npm / npx** | Exporte antes de subir: `export N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true && n8n start`. |
   | **n8n Cloud** | Já habilitado nos planos que suportam community nodes. |

   > Sem essa variável o node **não aparece** na lista de tools do AI Agent — é a causa nº 1 de "não acho o node como tool".

2. **No workflow**, adicione um node **AI Agent**, conecte um **Chat Model** e, no conector **Tool**, adicione o **RD Station Marketing**. Escolha o **Recurso** e a **Operação** que o agente pode usar (ex.: Event → Send Conversion). Uma tool por operação é a prática recomendada.

### Deixe o modelo preencher os campos (`$fromAI`)

Em cada campo do node em modo tool aparece o botão **"Let the model define this"**, que usa a expressão. Exemplos neste pacote:

```
Contact → Create, campo Email:
{{ $fromAI('email', 'E-mail do contato a ser criado', 'string') }}

Event → Send Conversion, campo Conversion Identifier:
{{ $fromAI('conversionIdentifier', 'Identificador da conversão, por exemplo newsletter', 'string') }}

Segmentation → Get Many, campo Limit:
{{ $fromAI('limit', 'Quantidade máxima de segmentações', 'number', 20) }}
```

- Assinatura: `$fromAI(key, description?, type?, defaultValue?)` — `key` de 1–64 caracteres (`[a-zA-Z0-9_-]`); `type` = `string` | `number` | `boolean` | `json`.
- Você pode **misturar**: fixar alguns campos (ex.: sempre o mesmo identificador de conversão) e deixar o modelo preencher outros (e-mail, nome).
- Quanto mais específico o seu prompt ou a System Message do agente, melhor o resultado.

### Boas práticas

- **Restrinja o escopo:** exponha só as operações que o agente precisa (ex.: só *Get* e *Create* de Contact), em vez de liberar tudo. Evite expor os Delete.
- **Credencial dedicada** com permissões mínimas para o agente.
- **n8n atualizado:** versões antigas tinham um bug em que a tool de community node retornava resposta vazia para o agente ([n8n#26202](https://github.com/n8n-io/n8n/issues/26202)); já corrigido.
- O **Trigger** (`RD Station Marketing Trigger`) **não** é uma tool — triggers não podem ser usados por agentes (por design do n8n).

### Referências

- [Tools Agent — n8n Docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent)
- [Let AI specify tool parameters (`$fromAI`) — n8n Docs](https://docs.n8n.io/advanced-ai/examples/using-the-fromai-function/)
- [Variáveis de ambiente de nodes — n8n Docs](https://docs.n8n.io/hosting/configuration/environment-variables/nodes/)

## 🛠️ Desenvolvimento

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

A versão 1.0.0 já está no npm. Os passos 4 e 5 ainda esperam teste com conta real (decisão AD-011 em `.specs/STATE.md`).

## ✅ Compatibilidade

- Requer n8n com `n8nNodesApiVersion` 1.
- Testado com o `n8n-workflow` 2.16 e o `@n8n/node-cli` 0.55.5.

## 📚 Recursos

- [Documentação de community nodes do n8n](https://docs.n8n.io/integrations/community-nodes/)
- [Documentação da API do RD Station Marketing](https://developers.rdstation.com)

## 🚀 Publicação

O `publish.yml` envia a versão ao npm com provenance quando uma tag `v*.*.*` chega ao GitHub (ou quando alguém o roda à mão). Ele usa `npm stage publish`: a versão **fica em espera** e só vai ao ar depois que o dono a aprova, com 2FA, na aba **Staged Packages** do npmjs.com. Sem a aprovação, nada muda no registro.

## 📈 Versões

- **1.0.1** — **README completo.** O README segue o padrão do README do RD CRM, com índice, seção de Tool de IA, Versões, Suporte e apoio. O `package.json` ganha o campo `funding` e mais palavras-chave. Nenhum código mudou.
- **1.0.0** — **Primeira versão do pacote.** Node de ação com 14 recursos, gatilho de webhook, listas pesquisáveis, duas credenciais (OAuth2 e chave de API), eventos, erros claros e timeout de 30 s. O pacote tem o escopo `@pexuleco` porque o npm recusou o nome sem escopo. Veja o `CHANGELOG.md`.

## 🆘 Suporte

Se algo não funcionar:

1. Confirme se o **Client ID e o Client Secret** estão certos e se o **OAuth Redirect URL** do n8n está cadastrado no aplicativo da RD. Espere até 1 hora depois de mudar o `redirect_uri`.
2. Verifique se a versão do n8n é compatível.
3. Consulte os logs do n8n para detalhes do erro.
4. Abra uma [issue no GitHub](https://github.com/PedroHSGuimaraes/n8n-nodes-rd-station-marketing/issues).

## ☕ Apoie o projeto

Este node é mantido de forma independente. Se ele ajuda suas automações, você pode apoiar o desenvolvimento, a manutenção e as novas integrações pelo [Buy Me a Coffee](https://buymeacoffee.com/qTny0AzFXS).

## 📄 Licença

[MIT](LICENSE.md)
