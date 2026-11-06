/**
 * Recurso Campaign: listar campanhas, ler uma campanha e listar os itens dela.
 *
 * As campanhas existem só nos planos Pro e Advanced do RD Station Marketing. Em outros planos a RD
 * responde 403 ou 404, e o texto de erro aponta essa causa provável.
 */
import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import {
	idLocator,
	operationSelector,
	returnAllAndLimit,
	searchField,
	showFor,
} from '../descriptions';
import { requireValue } from '../helpers';
import type { RdErrorHint } from '../transport';
import { rdMarketingApiRequest, rdMarketingPaginate } from '../transport';

// Máximo de itens por página que a RD documenta para campanhas.
const CAMPAIGN_PAGE_SIZE = 50;

// Texto que acompanha o 403 e o 404 das campanhas (o plano do cliente costuma ser a causa).
const PLAN_HINT = {
	message: 'The campaigns could not be read',
	description: 'This feature may need the Pro or Advanced plan of RD Station Marketing',
};
const PLAN_HINTS: Record<number, RdErrorHint> = { 403: PLAN_HINT, 404: PLAN_HINT };

const properties: INodeProperties[] = [
	// Campanha escolhida numa lista lida da conta.
	idLocator({
		name: 'campaignId',
		displayName: 'Campaign',
		resource: 'campaign',
		operations: ['get', 'getItems'],
		searchListMethod: 'searchCampaigns',
		description: 'The campaign to read',
		placeholder: 'e.g. 12345',
	}),
	{
		// Filtra os itens por tipo; vazio devolve todos os tipos.
		displayName: 'Item Type',
		name: 'itemType',
		type: 'options',
		options: [
			{ name: 'All', value: '' },
			{ name: 'Automation Flow', value: 'workflow' },
			{ name: 'Email', value: 'email' },
			{ name: 'Form', value: 'form' },
			{ name: 'Landing Page', value: 'landing_page' },
			{ name: 'Popup', value: 'popup' },
		],
		default: '',
		description: 'Only return items of this type',
		displayOptions: showFor('campaign', ['getItems']),
	},
	// Busca por nome da campanha.
	searchField('campaign', ['getMany']),
	// Return All e Limit da lista de campanhas e de itens.
	...returnAllAndLimit('campaign', ['getMany', 'getItems']),
];

// Lê o ID da campanha escolhida; falha se a pessoa não escolheu nenhuma.
function campaignIdOf(context: IExecuteFunctions, i: number): string {
	// `extractValue` devolve o texto do ID, venha ele da lista ou digitado.
	const id = context.getNodeParameter('campaignId', i, '', { extractValue: true }) as string;
	requireValue(context, i, id, 'Campaign');
	return id;
}

// Campaign → Get Many.
const getMany: OperationHandler = async function (i) {
	const search = this.getNodeParameter('search', i, '') as string;
	return rdMarketingPaginate.call(this, '/platform/campaigns', {
		qs: search ? { search } : {},
		itemsKey: 'campaigns',
		pageSize: CAMPAIGN_PAGE_SIZE,
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		itemIndex: i,
		errorHints: PLAN_HINTS,
	});
};

// Campaign → Get: a RD embrulha a campanha em `campaign`.
const get: OperationHandler = async function (i) {
	const response = await rdMarketingApiRequest.call(
		this,
		'GET',
		`/platform/campaigns/${campaignIdOf(this, i)}`,
		// Sem o aviso de plano: aqui um 404 quase sempre é ID errado, e o aviso enganaria.
		{ itemIndex: i },
	);
	return (response.campaign as IDataObject | undefined) ?? response;
};

// Campaign → Get Items.
const getItems: OperationHandler = async function (i) {
	const itemType = this.getNodeParameter('itemType', i, '') as string;
	return rdMarketingPaginate.call(this, `/platform/campaigns/${campaignIdOf(this, i)}/items`, {
		// O tipo só vai quando escolhido; "All" é o valor vazio.
		qs: itemType ? { item_type: itemType } : {},
		itemsKey: 'items',
		pageSize: CAMPAIGN_PAGE_SIZE,
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		// Sem o aviso de plano nos itens, pelo mesmo motivo do Get.
		itemIndex: i,
	});
};

export const campaignResource: ResourceModule = {
	value: 'campaign',
	name: 'Campaign',
	operationSelector: operationSelector(
		'campaign',
		[
			{
				name: 'Get',
				value: 'get',
				action: 'Get a campaign',
				description: 'Get the details of a campaign',
			},
			{
				name: 'Get Items',
				value: 'getItems',
				action: 'Get the items of a campaign',
				description: 'Get the emails, pages, forms and flows that belong to a campaign',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many campaigns',
				description: 'Get the campaigns of the account',
			},
		],
		'getMany',
	),
	properties,
	handlers: { getMany, get, getItems },
};
