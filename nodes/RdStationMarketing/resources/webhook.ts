/**
 * Recurso Webhook do node de ação: cria e gerencia os webhooks da RD pelo Webhook Service.
 *
 * Serve para quem quer controlar os webhooks à mão. Quem só quer receber eventos num workflow usa o
 * node gatilho, que registra e remove o webhook sozinho. Só os dois eventos do Marketing aparecem;
 * os `crm_deal_*` da mesma rota pertencem ao pacote do CRM.
 */
import type { INodeProperties } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import { idLocator, operationSelector, returnAllAndLimit, showFor } from '../descriptions';
import { requireValue } from '../helpers';
import { rdMarketingApiRequest, rdMarketingPaginate } from '../transport';
import { buildWebhookBody, WEBHOOK_CONVERTED, WEBHOOK_MARKED_OPPORTUNITY } from '../webhookBody';

// Criar e atualizar usam os mesmos campos (o PUT da RD é completo).
const WITH_BODY = ['create', 'update'];

const properties: INodeProperties[] = [
	// Webhook escolhido numa lista lida da conta.
	idLocator({
		name: 'webhookId',
		displayName: 'Webhook',
		resource: 'webhook',
		operations: ['get', 'update', 'delete'],
		searchListMethod: 'searchWebhooks',
		description: 'The webhook to work with',
		placeholder: 'e.g. 3f2a0f6c-6b1e-4d6e-9f5a-0a1b2c3d4e5f',
	}),
	{
		// Evento que dispara o webhook: só os dois do Marketing.
		displayName: 'Event Type',
		name: 'eventType',
		type: 'options',
		options: [
			{ name: 'Converted', value: WEBHOOK_CONVERTED },
			{ name: 'Marked as Opportunity', value: WEBHOOK_MARKED_OPPORTUNITY },
		],
		default: WEBHOOK_CONVERTED,
		description: 'The RD Station event that triggers the webhook',
		displayOptions: showFor('webhook', WITH_BODY),
	},
	{
		// Endereço que recebe o evento; a RD só aceita HTTPS público que responda 2xx.
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://n8n.example.com/webhook/abc',
		description: 'Public HTTPS URL that receives the event and answers with a 2xx status',
		displayOptions: showFor('webhook', WITH_BODY),
	},
	{
		// O filtro por identificador só existe para conversões, por isso some em "Marked as Opportunity".
		displayName: 'Conversion Identifiers',
		name: 'eventIdentifiers',
		type: 'string',
		default: '',
		placeholder: 'e.g. newsletter, landing-1',
		description: 'Comma-separated conversion identifiers. Leave empty to receive all conversions.',
		displayOptions: {
			show: { resource: ['webhook'], operation: WITH_BODY, eventType: [WEBHOOK_CONVERTED] },
		},
	},
	{
		// Dados extras que a RD anexa ao corpo do evento.
		displayName: 'Include Relations',
		name: 'includeRelations',
		type: 'multiOptions',
		options: [
			{ name: 'Company', value: 'COMPANY' },
			{ name: 'Contact Funnel', value: 'CONTACT_FUNNEL' },
		],
		default: [],
		description: 'Extra data of the contact to send in the event body',
		displayOptions: showFor('webhook', WITH_BODY),
	},
	// Return All e Limit da lista (sem paginação na RD).
	...returnAllAndLimit('webhook', ['getMany']),
];

// Lê o UUID do webhook escolhido; falha se a pessoa não escolheu nenhum.
const webhookIdOf = (context: Parameters<typeof requireValue>[0], i: number): string => {
	// `extractValue` devolve o texto do ID, venha ele da lista ou digitado.
	const id = context.getNodeParameter('webhookId', i, '', { extractValue: true }) as string;
	requireValue(context, i, id, 'Webhook');
	return id;
};

// Corpo comum da criação e da atualização, montado pela mesma função do gatilho.
const bodyOf = (context: Parameters<typeof requireValue>[0], i: number) =>
	buildWebhookBody({
		eventType: context.getNodeParameter('eventType', i) as string,
		url: context.getNodeParameter('url', i) as string,
		identifiers: context.getNodeParameter('eventIdentifiers', i, '') as string,
		relations: context.getNodeParameter('includeRelations', i, []) as string[],
	});

// Webhook → Create.
const create: OperationHandler = async function (i) {
	return rdMarketingApiRequest.call(this, 'POST', '/integrations/webhooks', {
		body: bodyOf(this, i),
		itemIndex: i,
	});
};

// Webhook → Get.
const get: OperationHandler = async function (i) {
	return rdMarketingApiRequest.call(this, 'GET', `/integrations/webhooks/${webhookIdOf(this, i)}`, {
		itemIndex: i,
	});
};

// Webhook → Get Many: a RD devolve `{ webhooks: [...] }` e só lista os criados pela mesma integração.
const getMany: OperationHandler = async function (i) {
	return rdMarketingPaginate.call(this, '/integrations/webhooks', {
		paginated: false,
		itemsKey: 'webhooks',
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		itemIndex: i,
	});
};

// Webhook → Update: PUT completo, com os mesmos campos da criação.
const update: OperationHandler = async function (i) {
	return rdMarketingApiRequest.call(this, 'PUT', `/integrations/webhooks/${webhookIdOf(this, i)}`, {
		body: bodyOf(this, i),
		itemIndex: i,
	});
};

// Webhook → Delete.
const remove: OperationHandler = async function (i) {
	await rdMarketingApiRequest.call(
		this,
		'DELETE',
		`/integrations/webhooks/${webhookIdOf(this, i)}`,
		{
			itemIndex: i,
		},
	);
	// A RD responde 204 sem corpo; o item `deleted` deixa o workflow seguir.
	return { deleted: true };
};

export const webhookResource: ResourceModule = {
	value: 'webhook',
	name: 'Webhook',
	operationSelector: operationSelector(
		'webhook',
		[
			{
				name: 'Create',
				value: 'create',
				action: 'Create a webhook',
				description: 'Register a webhook in RD Station',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a webhook',
				description: 'Delete a webhook',
			},
			{ name: 'Get', value: 'get', action: 'Get a webhook', description: 'Get a webhook' },
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many webhooks',
				description: 'Get the webhooks created by this integration',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a webhook',
				description: 'Change the event or the URL of a webhook',
			},
		],
		'getMany',
	),
	properties,
	handlers: { create, get, getMany, update, delete: remove },
};
