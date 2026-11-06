/**
 * Corpo de criação de webhook da RD, compartilhado pelo node de ação e pelo gatilho.
 *
 * O `POST /integrations/webhooks` (criar) e o `PUT /integrations/webhooks/{uuid}` (atualizar)
 * recebem o mesmo corpo completo. Manter a montagem num lugar só garante que o gatilho e o node de
 * ação nunca divirjam nas regras (por exemplo, quando `event_identifiers` é permitido).
 */
import type { IDataObject } from 'n8n-workflow';

import { compact, splitList } from './helpers';

// Os dois eventos do RD Station Marketing. Os `crm_deal_*` que a mesma rota aceita são do RD CRM
// e ficam no pacote do CRM (decisão AD-001).
export const WEBHOOK_CONVERTED = 'WEBHOOK.CONVERTED';
export const WEBHOOK_MARKED_OPPORTUNITY = 'WEBHOOK.MARKED_OPPORTUNITY';

export interface WebhookBodyInput {
	eventType: string;
	url: string;
	// Identificadores de conversão separados por vírgula; só valem para `WEBHOOK.CONVERTED`.
	identifiers?: string;
	// Dados extras que a RD anexa ao corpo: `COMPANY` e/ou `CONTACT_FUNNEL`.
	relations?: string[];
}

// Monta o corpo do webhook, omitindo o que a RD não aceita ou o que ficou vazio.
export function buildWebhookBody(input: WebhookBodyInput): IDataObject {
	const body: IDataObject = {
		event_type: input.eventType,
		entity_type: 'CONTACT',
		url: input.url,
		http_method: 'POST',
	};
	// O filtro por identificador só existe para conversões; em oportunidade a RD o recusaria.
	if (input.eventType === WEBHOOK_CONVERTED) {
		Object.assign(body, compact({ event_identifiers: splitList(input.identifiers) }));
	}
	// As relações só vão quando a pessoa escolheu alguma.
	Object.assign(body, compact({ include_relations: input.relations ?? [] }));
	return body;
}
