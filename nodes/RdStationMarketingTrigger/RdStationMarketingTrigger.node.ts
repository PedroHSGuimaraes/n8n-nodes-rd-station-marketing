/**
 * Node gatilho do RD Station Marketing.
 *
 * Inicia o workflow quando a RD envia uma conversão ou uma oportunidade. Ao ativar o workflow ele
 * cadastra o webhook na RD (`POST /integrations/webhooks`) com a URL de produção do n8n e guarda o
 * `uuid` no static data; ao desativar, apaga o webhook (`DELETE /integrations/webhooks/{uuid}`).
 * Assim a pessoa não cadastra nem apaga webhook à mão no painel.
 */
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

import { extractItems } from '../RdStationMarketing/helpers';
import { rdMarketingApiRequest } from '../RdStationMarketing/transport';
import {
	buildWebhookBody,
	WEBHOOK_CONVERTED,
	WEBHOOK_MARKED_OPPORTUNITY,
} from '../RdStationMarketing/webhookBody';

// Valor salvo no workflow de cada evento da tela → tipo de evento da RD.
const EVENT_TYPES: Record<string, string> = {
	converted: WEBHOOK_CONVERTED,
	markedOpportunity: WEBHOOK_MARKED_OPPORTUNITY,
};

// Texto que explica as duas causas de a RD recusar a URL do webhook.
const URL_HELP = 'RD Station only accepts public HTTPS URLs that answer with a 2xx status';

export class RdStationMarketingTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'RD Station Marketing Trigger',
		// Nome persistido nos workflows salvos: não pode mudar depois do lançamento (porta de uma via).
		name: 'rdStationMarketingTrigger',
		icon: { light: 'file:rdStationMarketing.svg', dark: 'file:rdStationMarketing.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description:
			'Starts the workflow when RD Station Marketing sends a conversion or opportunity event',
		defaults: { name: 'RD Station Marketing Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		// O Webhook Service da RD só aceita OAuth2.
		credentials: [{ name: 'rdStationMarketingOAuth2Api', required: true }],
		// A RD espera resposta 2xx em 5 s, então respondemos assim que o corpo chega.
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		],
		properties: [
			{
				// Evento da RD que dispara o workflow.
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{ name: 'Converted', value: 'converted' },
					{ name: 'Marked as Opportunity', value: 'markedOpportunity' },
				],
				default: 'converted',
				description: 'The RD Station event that starts the workflow',
			},
			{
				// Filtro opcional por identificador de conversão; só existe para o evento "Converted".
				displayName: 'Conversion Identifiers',
				name: 'conversionIdentifiers',
				type: 'string',
				default: '',
				placeholder: 'e.g. newsletter, landing-1',
				description:
					'Comma-separated conversion identifiers. Leave empty to receive all conversions.',
				displayOptions: { show: { event: ['converted'] } },
			},
			{
				// Dados extras do contato que a RD anexa ao corpo do evento.
				displayName: 'Include Relations',
				name: 'includeRelations',
				type: 'multiOptions',
				options: [
					{ name: 'Company', value: 'COMPANY' },
					{ name: 'Contact Funnel', value: 'CONTACT_FUNNEL' },
				],
				default: [],
				description: 'Extra data of the contact to receive in the event body',
			},
		],
	};

	// Ciclo de vida do webhook na RD, chamado pelo n8n ao ativar e ao desativar o workflow.
	webhookMethods = {
		default: {
			// O n8n pergunta se o webhook já existe para não criar um segundo na reativação.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const uuid = staticData.webhookUuid as string | undefined;
				// Nunca criado por este workflow: nem vale perguntar à RD.
				if (!uuid) return false;
				const response = await rdMarketingApiRequest.call(this, 'GET', '/integrations/webhooks');
				// A RD lista só os webhooks criados pela mesma integração; o nosso `uuid` tem de estar lá.
				return extractItems(response, 'webhooks').some((webhook) => webhook.uuid === uuid);
			},

			// Cadastra o webhook com a URL de produção do n8n e guarda o `uuid` para apagar depois.
			async create(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const body = buildWebhookBody({
					eventType: EVENT_TYPES[this.getNodeParameter('event') as string],
					url: this.getNodeWebhookUrl('default') as string,
					identifiers: this.getNodeParameter('conversionIdentifiers', '') as string,
					relations: this.getNodeParameter('includeRelations', []) as string[],
				});
				const created = await rdMarketingApiRequest.call(this, 'POST', '/integrations/webhooks', {
					body,
					// `INVALID_URL` quer dizer que a RD não conseguiu usar o endereço do n8n.
					errorHints: {
						400: { description: URL_HELP, whenBodyIncludes: 'INVALID_URL' },
						// A RD valida a URL na criação e, se ela não responde 2xx, devolve 401 e não cria.
						401: { description: `Reconnect the RD Station credential. ${URL_HELP}` },
					},
				});
				// Sem `uuid` não há como apagar o webhook depois; tratar como falha evita webhook órfão.
				if (created.uuid === undefined) return false;
				staticData.webhookUuid = created.uuid;
				return true;
			},

			// Apaga o webhook da RD ao desativar o workflow e esquece o `uuid`.
			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const uuid = staticData.webhookUuid as string | undefined;
				// Nada a apagar: o workflow nunca chegou a cadastrar webhook.
				if (!uuid) return true;
				try {
					await rdMarketingApiRequest.call(this, 'DELETE', `/integrations/webhooks/${uuid}`);
				} catch (error) {
					// 404: alguém já apagou o webhook na RD, então o objetivo foi cumprido.
					// Qualquer outro erro sobe e o `uuid` fica guardado para a próxima tentativa.
					const gone = error instanceof NodeApiError && error.httpCode === '404';
					if (!gone) {
						throw error instanceof NodeApiError
							? error
							: new NodeApiError(this.getNode(), error as JsonObject);
					}
				}
				delete staticData.webhookUuid;
				return true;
			},
		},
	};

	// Recebe o corpo da RD e o emite como item do workflow.
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData();
		// Na criação a RD testa a URL com um corpo sem `event_type`: responde 2xx e não inicia o workflow.
		if (!body || body.event_type === undefined) return { webhookResponse: 'OK' };
		return { workflowData: [this.helpers.returnJsonArray(body as IDataObject)] };
	}
}
