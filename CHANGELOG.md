# Changelog

## 1.0.0

- **Primeira versão do pacote.** O `@pexuleco/n8n-nodes-rd-station-marketing` cobre o RD Station Marketing em um node de ação e em um gatilho. O RD Station CRM continua no pacote `n8n-nodes-rd-station-crm`.
- **Nome com escopo.** O pacote sai como `@pexuleco/n8n-nodes-rd-station-marketing`. O npm recusou o nome sem escopo (E400) porque já existe o `n8n-nodes-rdstation-marketing`; sem pontuação, os dois nomes ficam iguais. O repositório continua `n8n-nodes-rd-station-marketing`.
- **Node de ação com 14 recursos.** Contact, Custom Field, Funnel, Segmentation, Automation Flow, Email, Landing Page, Popup, Form, Campaign, Analytics, Event, Product Catalog e Webhook.
- **Listas pesquisáveis.** Os IDs de segmentação, fluxo, e-mail, campanha, catálogo, webhook e campo personalizado abrem em **From list** com busca. Os campos `cf_*` vêm da conta em um dropdown.
- **Saída sem envelope.** As listagens devolvem um item por registro e paginam com Return All e Limit. Todo Delete devolve `{ "deleted": true }`.
- **Duas credenciais.** A OAuth2 serve todas as operações e o gatilho. A chave de API serve só Send Conversion, escolhida no campo Authentication.
- **Eventos.** Conversão, oportunidade, venda, oportunidade perdida, chat, ligação, mídia, os oito eventos `ECOMMERCE_*` e envio em lote de até 0,2 MB. Os eventos de e-commerce descontinuados não existem.
- **Gatilho de webhook.** Cadastra o webhook na RD ao ativar o workflow, guarda o `uuid` e o apaga ao desativar.
- **Erros claros.** Os erros 401, 429 e 400 da RD viram mensagens com a ação sugerida, e as validações (e-mail ou telefone, datas, JSON) falham antes da requisição.
- **Timeout de 30 s** em toda requisição à RD e zero dependências de runtime.
- **Pendente antes da tag `v1.0.0`.** Teste com conta real da renovação do token OAuth2 e da aceitação de campos `cf_*` em contatos.
