# RD Station Marketing v1 checks

Build: `npm run build`; `npx tsc --noEmit`; `npm run lint`
Run unit: `npm test`
Plan: `.specs/features/rd-station-marketing-v1/plan.md`

Cada teste do `test/*.test.cjs` abre o nome com o id do check (`C18 - ...`). A linha de prova procura
`✔ C18 -` na saída do reporter `spec`, então um teste renomeado ou removido vira `no test ran`.

112 checks in 13 slices · 6 one-way doors · 0 open, of which 0 block

## Checks

### S1 - pacote, toolchain e entrega

**C1** - `npm run build` gera em `dist/` o node de ação, o gatilho, as duas credenciais e os ícones `.svg` ao lado de cada node (AC 1)
Proof: run unit | ✔ C1 -

**C2** - `n8n-node lint` sai com código 0 e 0 erros (AC 2)
Proof: `npm run lint`

**C3** - O `package.json` traz nome, versão 1.0.0, licença MIT, keyword da comunidade, scripts, `n8n.strict`, `@n8n/node-cli` 0.55.5, 2 nodes, 2 credenciais e nenhum `dependencies` (AC 3)
Proof: run unit | ✔ C3 -

**C4** - `npm test` compila e roda a suíte com `# fail 0` (AC 4)
Proof: run unit | fail 0

**C5** - O workflow de CI roda `npm ci`, lint, test e build no Pull Request (AC 5)
Proof: run unit | ✔ C5 -

**C6** - O workflow de publicação confere a tag contra a versão, roda lint, test e build e publica com provenance (AC 6, sem o `npm view`, que só existe depois da tag; ver Settled mid-build)
Proof: run unit | ✔ C6 -

**C7** - O teste de comentários falha nomeando o `.ts` que não abre com bloco `/**` (AC 7)
Proof: run unit | ✔ C7 -

**C8** - O README está em PT-BR com as 5 seções e o CHANGELOG tem `## 1.0.0` (AC 8)
Proof: run unit | ✔ C8 -

### S2 - credenciais e transporte

**C9** - A credencial OAuth2 estende `oAuth2Api` com `authorizationCode`, as duas URLs e `authentication` `body` (AC 1)
Proof: run unit | ✔ C9 -

**C10** - A credencial de chave de API tem `apiKey` com `typeOptions.password` (AC 2)
Proof: run unit | ✔ C10 -

**C11** - Toda requisição leva `timeout` 30000, base `https://api.rd.services` e `Content-Type: application/json` (AC 3)
Proof: run unit | ✔ C11 -

**C12** - Send Conversion com `apiKey` chama `POST /platform/conversions` com `api_key` na query e sem `Authorization`; com `oAuth2` chama `POST /platform/events` (AC 4)
Proof: run unit | ✔ C12 -

**C13** - O seletor `authentication` só aparece em Send Conversion (AC 5)
Proof: run unit | ✔ C13 -

**C14** - `401` vira `NodeApiError` com a mensagem e a descrição do plano (AC 6)
Proof: run unit | ✔ C14 -

**C15** - `429` vira `NodeApiError` com `Wait 44 seconds`, `1 second` e o texto sem `remaining_time` (AC 7)
Proof: run unit | ✔ C15 -

**C16** - `400` com `errors.email[0].error_type` vira `RD Station rejected the 'email' field: CANNOT_BE_NULL [item 0]` (AC 8)
Proof: run unit | ✔ C16 -

**C17** - Com Continue On Fail o item 1 devolve `{ error }` e o item 2 é processado (AC 9)
Proof: run unit | ✔ C17 -

### S3 - contatos

**C18** - Contact Get com e-mail chama `GET /platform/contacts/email:foo@bar.com` e devolve 1 item (AC 1)
Proof: run unit | ✔ C18 -

**C19** - Contact Create envia `{ email, name }` em `POST /platform/contacts` (AC 2)
Proof: run unit | ✔ C19 -

**C20** - Contact Create sem e-mail e sem telefone lança `Provide an email or a phone [item 0]` sem chamar a RD (AC 3)
Proof: run unit | ✔ C20 -

**C21** - Contact Update por e-mail não envia `email`; por `uuid` envia o `email` novo (AC 4)
Proof: run unit | ✔ C21 -

**C22** - Contact Update com `tags` `a, b` envia `["a", "b"]` e a descrição diz `Replaces all existing tags` (AC 5)
Proof: run unit | ✔ C22 -

**C23** - Contact Delete chama `DELETE` e devolve `{ deleted: true }` com `204` sem corpo (AC 6)
Proof: run unit | ✔ C23 -

**C24** - Contact Add Tags chama `POST .../tag` com `{ tags: ["Primeiro contato"] }` (AC 7)
Proof: run unit | ✔ C24 -

**C25** - Contact Get Events com Return All chama `GET /platform/contacts/<uuid>/events` com `event_type=CONVERSION` e as páginas 1, 2, 3 até vir uma vazia (AC 8)
Proof: run unit | ✔ C25 -

**C26** - Custom Fields de Create e Update entram no corpo como `cf_plano: "Pro"` (AC 9)
Proof: run unit | ✔ C26 -

**C27** - Simplify em Contact Get devolve só os 10 campos do plano (AC 10)
Proof: run unit | ✔ C27 -

**C28** - `404` em Contact Get vira `The contact was not found [item 0]` com a descrição do plano (AC 11)
Proof: run unit | ✔ C28 -

### S4 - campos personalizados

**C29** - Custom Field Get Many com Return All chama `GET /platform/contacts/fields` uma vez, sem `page`, e devolve 1 item por campo (AC 1)
Proof: run unit | ✔ C29 -

**C30** - Custom Field Get Many com Limit 10 e 25 campos devolve 10 itens (AC 2)
Proof: run unit | ✔ C30 -

**C31** - Custom Field Create envia `name` e `label` como `{ "pt-BR": "Plano" }` (AC 3)
Proof: run unit | ✔ C31 -

**C32** - `api_identifier` sem `cf_` lança `The 'API Identifier' must start with 'cf_' [item 0]` sem chamar a RD (AC 4)
Proof: run unit | ✔ C32 -

**C33** - Custom Field Update chama `PATCH .../fields/<uuid>` sem `api_identifier` no corpo (AC 5)
Proof: run unit | ✔ C33 -

**C34** - Custom Field Delete chama `DELETE` e devolve `{ deleted: true }` (AC 6)
Proof: run unit | ✔ C34 -

**C35** - O `loadOptions` de campos mantém só `custom_field` verdadeiro e devolve `{ name, value: api_identifier }` (AC 7)
Proof: run unit | ✔ C35 -

### S5 - funil do contato

**C36** - Funnel Get chama `GET .../funnels/default` e devolve os 5 campos (AC 1)
Proof: run unit | ✔ C36 -

**C37** - Funnel Update envia `{ lifecycle_stage, opportunity }` por `PUT` (AC 2)
Proof: run unit | ✔ C37 -

**C38** - O dropdown `lifecycleStage` tem exatamente `Lead`, `Qualified Lead` e `Client` (AC 3)
Proof: run unit | ✔ C38 -

**C39** - `removeContactOwner` envia `contact_owner_email: null`; desligado e vazio omite o campo (AC 4)
Proof: run unit | ✔ C39 -

### S6 - segmentações e fluxos

**C40** - Segmentation Get Many com Return All usa `page_size` 125 e pagina até vir página curta (125+40 → 165 itens e 2 chamadas; 125+0 → 125 itens e 2 chamadas) (AC 1)
Proof: run unit | ✔ C40 -

**C41** - Segmentation Get Contacts chama `GET /platform/segmentations/<id>/contacts` e devolve 1 item por contato (AC 2)
Proof: run unit | ✔ C41 -

**C42** - O `listSearch` de segmentações envia `search=leads`, devolve `{ name, value: id }` e inclui os ids 1 a 5 com busca vazia (AC 3)
Proof: run unit | ✔ C42 -

**C43** - Automation Flow Get Many extrai os itens da chave `wokflows` (AC 4)
Proof: run unit | ✔ C43 -

**C44** - Automation Flow Get chama `GET /platform/workflows/<id>` e devolve `workflow_info` (AC 5)
Proof: run unit | ✔ C44 -

**C45** - Automation Flow Add Leads envia `{ leads: [...] }` e devolve `leads_added` e `leads_not_found` (AC 6)
Proof: run unit | ✔ C45 -

**C46** - Get Leads Started, Left e Action Executed chamam `/leads/started`, `/leads/left` e `/leads/action/<action_id>` com as datas (AC 7)
Proof: run unit | ✔ C46 -

**C47** - `endDate` antes de `startDate` lança `The 'End Date' is before the 'Start Date' [item 0]` sem chamar a RD (AC 8)
Proof: run unit | ✔ C47 -

**C48** - O `loadOptions` de ações lê `GET /platform/workflows/<id>` e devolve `{ name: type, value: id }` (AC 9)
Proof: run unit | ✔ C48 -

### S7 - e-mails, páginas, formulários e campanhas

**C49** - Email Get Many com a busca `boas-vindas` envia `query=boas-vindas` e devolve 1 item por elemento de `items` (AC 1)
Proof: run unit | ✔ C49 -

**C50** - Email Get chama `GET /platform/emails/<id>` (AC 2)
Proof: run unit | ✔ C50 -

**C51** - Landing Page, Pop-up e Form Get Many chamam `/platform/landing_pages`, `/platform/popups` e `/platform/embeddables` com `page` e `page_size` (AC 3)
Proof: run unit | ✔ C51 -

**C52** - Campaign Get Many com Return All usa `page_size` 50 e pagina até vir menos de 50 (AC 4)
Proof: run unit | ✔ C52 -

**C53** - Campaign Get e Get Items chamam `/platform/campaigns/<id>` e `/items` e devolvem `campaign` ou 1 item por `items` (AC 5)
Proof: run unit | ✔ C53 -

**C54** - Campaign Get Items com `itemType` `email` envia `item_type=email` (AC 6)
Proof: run unit | ✔ C54 -

**C55** - `403` ou `404` em Campaign Get Many leva a descrição sobre os planos Pro e Advanced (AC 7)
Proof: run unit | ✔ C55 -

### S8 - analytics

**C56** - Analytics Get Emails envia as datas e devolve 1 item por elemento de `emails` (AC 1)
Proof: run unit | ✔ C56 -

**C57** - Get Workflow Emails, Get Funnel e Get Conversions chamam as 3 rotas e devolvem 1 item por linha (AC 2)
Proof: run unit | ✔ C57 -

**C58** - Get Funnel envia `grouped_by=weekly` e, no padrão, `grouped_by=daily` (AC 3)
Proof: run unit | ✔ C58 -

**C59** - Get Conversions envia `assets_type[]=LandingPage&assets_type[]=Popup` (AC 4)
Proof: run unit | ✔ C59 -

**C60** - Nas 4 operações de Analytics, `endDate` antes de `startDate` lança o erro do plano sem chamar a RD (AC 5)
Proof: run unit | ✔ C60 -

### S9 - eventos

**C61** - Send Conversion envia `CONVERSION`, `CDP` e o `payload` com `conversion_identifier` e `email`, e devolve `event_uuid` (AC 1)
Proof: run unit | ✔ C61 -

**C62** - Send Conversion sem e-mail e sem telefone lança `Provide an email or a phone [item 0]` sem chamar a RD (AC 2)
Proof: run unit | ✔ C62 -

**C63** - `cf_plano: "Pro"` de Custom Fields entra dentro de `payload` (AC 3)
Proof: run unit | ✔ C63 -

**C64** - Mark Opportunity envia `OPPORTUNITY` com `funnel_name: "default"` (AC 4)
Proof: run unit | ✔ C64 -

**C65** - Mark Sale envia `SALE` com `value` 1500 e omite `value` vazio (AC 5)
Proof: run unit | ✔ C65 -

**C66** - Mark Lost Opportunity envia `OPPORTUNITY_LOST` com `reason` (AC 6)
Proof: run unit | ✔ C66 -

**C67** - `reason` vazio lança `The 'Reason' parameter is empty [item 0]` sem chamar a RD (AC 7)
Proof: run unit | ✔ C67 -

**C68** - Send Chat Event envia `CHAT_STARTED` com `chat_subject` e `cf_chat_status`, e `CHAT_FINISHED` exige `cf_chat_transcript_message` (AC 8)
Proof: run unit | ✔ C68 -

**C69** - Send Call Finished envia `CALL_FINISHED` com `call_from_number` e `call_status` (AC 9)
Proof: run unit | ✔ C69 -

**C70** - Send Media Event com `Stopped` envia `MEDIA_PLAYBACK_STOPPED` com `media_type` e `media_identifier` (AC 10)
Proof: run unit | ✔ C70 -

**C71** - Send Custom Event envia o `event_type` e o `payload` com `CDP`, e o dropdown lista os 8 tipos `ECOMMERCE_*` e nenhum descontinuado (AC 11)
Proof: run unit | ✔ C71 -

**C72** - Send Batch chama `POST /platform/events/batch` com o array de 3 eventos e devolve `event_batch_uuid` e `events` (AC 12)
Proof: run unit | ✔ C72 -

**C73** - Corpo de Send Batch acima de 200000 bytes lança `The batch is larger than 0.2 MB [item 0]` sem chamar a RD (AC 13)
Proof: run unit | ✔ C73 -

**C74** - JSON inválido em Send Custom Event ou Send Batch lança `The 'Payload' parameter is not valid JSON [item 0]` (AC 14)
Proof: run unit | ✔ C74 -

### S10 - catálogo de produtos e webhooks

**C75** - Product Catalog Create envia `name`, `url`, `format` e omite `username` e `password` vazios (AC 1)
Proof: run unit | ✔ C75 -

**C76** - Product Catalog Get, Get Many, Update e Delete chamam GET, GET, PATCH e DELETE, e o Delete devolve `{ deleted: true }` (AC 2)
Proof: run unit | ✔ C76 -

**C77** - O dropdown `format` do catálogo tem exatamente `xml`, `json` e `google_shopping` (AC 3)
Proof: run unit | ✔ C77 -

**C78** - Webhook Create envia `entity_type` `CONTACT`, `http_method` `POST` e `event_identifiers` `["newsletter"]` (AC 4)
Proof: run unit | ✔ C78 -

**C79** - Com `WEBHOOK.MARKED_OPPORTUNITY` o campo `eventIdentifiers` fica escondido e o corpo omite `event_identifiers` (AC 5)
Proof: run unit | ✔ C79 -

**C80** - Webhook Get, Get Many, Update e Delete chamam GET, GET, PUT e DELETE, e o Delete devolve `{ deleted: true }` (AC 6)
Proof: run unit | ✔ C80 -

**C81** - O dropdown `eventType` do node de ação tem só os 2 eventos do Marketing e nenhum `crm_deal_*` (AC 7)
Proof: run unit | ✔ C81 -

### S11 - gatilho de webhook

**C82** - Ativar com `Converted` chama `POST /integrations/webhooks` com `WEBHOOK.CONVERTED`, `CONTACT`, `POST` e a URL de produção, e grava `webhookUuid` (AC 1)
Proof: run unit | ✔ C82 -

**C83** - Ativar com `Marked as Opportunity` envia `WEBHOOK.MARKED_OPPORTUNITY` sem `event_identifiers` (AC 2)
Proof: run unit | ✔ C83 -

**C84** - `conversionIdentifiers` `newsletter, landing-1` vira `event_identifiers` na criação (AC 3)
Proof: run unit | ✔ C84 -

**C85** - `includeRelations` com `Company` e `Contact Funnel` vira `["COMPANY", "CONTACT_FUNNEL"]` (AC 4)
Proof: run unit | ✔ C85 -

**C86** - Com `webhookUuid` ainda listado pela RD, o `checkExists` devolve verdadeiro e nada é criado (AC 5)
Proof: run unit | ✔ C86 -

**C87** - Desativar chama `DELETE /integrations/webhooks/<uuid>` e apaga `webhookUuid`; `404` conta como apagado e `500` lança `NodeApiError` (AC 6)
Proof: run unit | ✔ C87 -

**C88** - `INVALID_URL` na criação lança `NodeApiError` com a descrição sobre HTTPS público (AC 7)
Proof: run unit | ✔ C88 -

**C89** - O webhook responde `200` e emite 1 item com o corpo completo de `WEBHOOK.CONVERTED` (AC 8)
Proof: run unit | ✔ C89 -

**C90** - Corpo sem `event_type` responde `200` e não emite item (AC 9)
Proof: run unit | ✔ C90 -

### S12 - descritores e portas de uma via

**C91** - Os nodes se chamam `rdStationMarketing` e `rdStationMarketingTrigger`, `version` 1, com `resource`, `operation`, `returnAll` e `limit` (Landing, nomes)
Proof: run unit | ✔ C91 -

**C92** - Todo ID que tem rota de listagem é `resourceLocator` com `list` (padrão, `searchable`) e `id` (Landing, forma dos IDs)
Proof: run unit | ✔ C92 -

**C93** - O `listSearch` com `401` da RD lança `NodeApiError` (Surface, `listSearch` e `loadOptions`)
Proof: run unit | ✔ C93 -

**C94** - O teste da credencial chama `GET /platform/contacts/fields` na base da RD (Surface, teste da credencial)
Proof: run unit | ✔ C94 -

**C95** - O gatilho declara o webhook `POST` no caminho `webhook` e responde na hora; o `404` com o workflow desativado é do n8n (Surface, gatilho)
Proof: run unit | ✔ C95 -

### S13 - achados da revisão the-judge (acrescentados depois da validação)

**C96** - Com o webhook salvo em outro evento, o `checkExists` devolve false e apaga o webhook antigo (the-judge F2)
Proof: run unit | ✔ C96 -

**C97** - Identificadores diferentes recriam e a ordem não importa; webhook de URL diferente nunca é apagado (the-judge F2, revisado pelo contrato por URL do lead em 06/11/2026)
Proof: run unit | ✔ C97 -

**C98** - Falha ao apagar o webhook antigo vai para o log e o `checkExists` ainda devolve false (the-judge F2)
Proof: run unit | ✔ C98 -

**C99** - Um 429 no meio do Return All é repetido depois da espera e o resultado tem as duas páginas (the-judge F3)
Proof: run unit | ✔ C99 -

**C100** - A espera do 429 usa o Retry-After, depois o `remaining_time`, depois 2 s fixos, com teto de 60 s (the-judge F3)
Proof: run unit | ✔ C100 -

**C101** - Depois de 3 requisições com 429 o erro claro de limite sobe, e outros erros como o 401 não são repetidos (the-judge F3)
Proof: run unit | ✔ C101 -

**C102** - Include Relations diferente recria o webhook; relações ausentes na lista da RD não forçam recriação (Verifier, segundo round)
Proof: run unit | ✔ C102 -

**C103** - No modo de teste, o webhook de produção (outra URL) não é apagado nem alterado e o uuid dele continua guardado (contrato por URL)
Proof: run unit | ✔ C103 -

**C104** - Achado pela URL deste modo com a mesma configuração, o `checkExists` guarda o uuid e devolve true sem DELETE (contrato por URL)
Proof: run unit | ✔ C104 -

**C105** - O `delete` apaga só o uuid guardado para a URL deste modo e não faz nada sem uuid para ela (contrato por URL)
Proof: run unit | ✔ C105 -

**C106** - Com duas entradas de mesma URL, fica a que bate com o node, as outras saem e o uuid guardado é o da que ficou; se nenhuma bate, todas saem e o resultado é false (terceiro Verifier)
Proof: run unit | ✔ C106 -

**C107** - Static data sem o mapa por URL nunca faz o `delete` apagar um webhook (terceiro Verifier)
Proof: run unit | ✔ C107 -

**C108** - Webhook da lista sem `uuid` é ignorado e nenhum "undefined" vai para o static data (terceiro Verifier)
Proof: run unit | ✔ C108 -

**C109** - Sem webhook da URL do modo na RD, o `checkExists` esquece o uuid guardado para essa URL e mantém o de outras URLs (terceiro Verifier)
Proof: run unit | ✔ C109 -

**C110** - O `publish.yml` publica pelo `npm@12.2.2 stage publish --provenance` com `RELEASE_MODE` e `NODE_AUTH_TOKEN` no env (token granular "stage only": a versão fica em espera até o dono aprovar na aba Staged Packages do npmjs.com), sem passo `npm publish` nem `npm run release`, com `workflow_dispatch` e na mesma versão de Node do `ci.yml`
Proof: run unit | ✔ C110 -

**C111** - O pacote se chama `@pexuleco/n8n-nodes-rd-station-marketing`, `publishConfig.access` é `public` e o README instala pelo nome com escopo (o npm recusou o nome sem escopo com E400 por colidir com `n8n-nodes-rdstation-marketing`; AD-015)
Proof: run unit | ✔ C111 -

**C112** - O README tem as seções do padrão do README do RD CRM (Funcionalidades, Instalação, Credenciais, Recursos e Operações, Gatilho, Usar como Tool de Agente de IA, Desenvolvimento, Compatibilidade, Recursos, Publicação, Versões, Suporte, Apoie o projeto, Licença), a variável `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`, exemplos de `$fromAI(`, toda versão do CHANGELOG em Versões, e o `package.json` traz `funding` com o link do Buy Me a Coffee (AD-016)
Proof: run unit | ✔ C112 -

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| ações de contato (7) | get C18 · create C19 · update C21 · delete C23 · addTags C24 · getEvents C25 · simplify C27 | - |
| ações de campo personalizado (4) | getMany C29 · create C31 · update C33 · delete C34 | - |
| ações de funil (2) | get C36 · update C37 | - |
| ações de segmentação e fluxo (8) | segmentações C40 · contatos C41 · fluxos C43 · fluxo C44 · addLeads C45 · started C46 · left C46 · action C46 | - |
| ações de e-mail, páginas e campanhas (7) | emails C49 · email C50 · páginas C51 · popups C51 · formulários C51 · campanhas C52 · campanha C53 | - |
| ações de analytics (4) | emails C56 · workflow_emails C57 · funnel C57 · conversions C57 | - |
| ações de evento (11) | conversão C61 · oportunidade C64 · venda C65 · perdida C66 · chat C68 · chamada C69 · mídia C70 · custom C71 · batch C72 · conversão por chave C12 · eventos pelo OAuth2 C12 | - |
| ações de catálogo e webhook (10) | catálogo create C75 · catálogo get C76 · catálogo getMany C76 · catálogo update C76 · catálogo delete C76 · webhook create C78 · webhook get C80 · webhook getMany C80 · webhook update C80 · webhook delete C80 | - |
| ações do gatilho (3) | create C82 · checkExists C86 · delete C87 | - |
| `rdStationMarketing` statuses (4) | 200 C18 · 400 C16 · 401 C14 · 429 C15 | - |
| `rdStationMarketingTrigger` statuses (2) | 200 C89 · 404 C95 | - |
| `listSearch` e `loadOptions` statuses (2) | 200 C42 · 401 C93 | - |
| teste da credencial statuses (2) | 200 C94 · 401 C94 | - |
| one-way doors (6) | nomes C91 · IDs C92 · saída das listagens C29 · static data C82 · credencial OAuth2 C9 · dependências C3 | - |
| casos de borda do contrato por URL (4) | URL repetida C106 · static data sem mapa C107 · sem uuid C108 · uuid sem webhook na RD C109 | - |
| contrato por URL do `checkExists` e do `delete` (5) | outra URL intacta C103 · mesma URL e mesma config C104 · mesma URL e config diferente C96 · delete só desta URL C105 · static data perdido C104 | - |
| divergências do webhook salvo (4) | evento C96 · URL C97 · identificadores C97 · relações C102 | - |
| espera do 429 (4) | Retry-After C100 · remaining_time C100 · fixa C100 · teto C100 | - |
| exemplos de paginação, AC S6.1 (2) | 125+40 C40 · 125+0 C40 | - |
| exemplos de `remaining_time` (3) | 43067 C15 · 1000 C15 · ausente C15 | - |
| webhook DELETE status (3) | 204 C87 · 404 C87 · 500 C87 | - |
| Contact Update identificador (2) | email C21 · uuid C21 | - |

## Swept

- validation: C20, C32, C47, C62, C67, C73, C74
- failure modes: C14, C15, C16, C28, C55
- idempotency: C86
- authorization: C14, C93
- concurrency: n/a - o node não divide estado entre execuções; só grava o `uuid` do webhook na ativação
- data lifecycle: C87
- dependency failure: C55, C87, C88
- state transitions: C82, C86, C87
- observability: n/a - o plano não pede log; o erro da RD chega ao usuário pelo `NodeApiError` (C14, C15, C16)

## Handoff

- **Settled mid-build:** 06/11/2026, dono: o token do npm continua "stage only", então o `publish.yml` publica por `npm stage publish` e o dono aprova cada versão na aba Staged Packages (AD-014, C110). 06/11/2026, lead (a pedido, depois do segundo Verifier): o `checkExists` do gatilho procura o webhook pela URL deste modo e nunca apaga nem altera webhook de outra URL; o `delete` apaga só o uuid guardado para a URL do modo (AD-013). 06/11/2026, dono: a tag `v1.0.0` só sai depois que ele testar com conta real (renovação do token OAuth2 e campos `cf_*`). O pacote fica com version 1.0.0, CHANGELOG, CI e publish prontos, sem tag, e o README explica o teste local com `npm run dev`. O `npm view` do C6 espera essa tag.
- **Dispatched:** Verifier (sonnet, sub-agente novo) em 06/11/2026 sobre o `HEAD` que contém este commit; returned: sim, FAIL com 8 achados; fechados em `f135d01`; segundo Verifier (sonnet, sub-agente novo) só para C96 a C101 dos achados da the-judge, no `HEAD` que contém este commit; returned: não; terceiro Verifier (sonnet, sub-agente novo) para C102 a C105 em `a9cb7c4`; returned: sim, 5 achados fechados em `f059248`; o mesmo Verifier retomado para C106 a C108 em `8c773b9`; returned: sim, 2 achados fechados em `95e0512`
- **Boundary:** C1-C95 fechados e `check_proofs.py` com 98 pass e 0 fail em `6de2a8d` e, depois da correção do Verifier, 98 pass em `f135d01`
- **Abandoned:** none
- **Walked:** n/a - sem tela do repositório; o editor do n8n é testado pelo dono com `npm run dev`
