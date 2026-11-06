/**
 * Recurso Segmentation: listar as segmentações da conta e os contatos de cada uma.
 *
 * A RD pagina segmentações e contatos de segmentação em até 125 itens por página. O total só vem
 * em cabeçalhos, então a paginação para quando uma página vem com menos de 125 itens.
 */
import type { INodeProperties } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import { idLocator, operationSelector, returnAllAndLimit, searchField } from '../descriptions';
import { requireValue } from '../helpers';
import { rdMarketingPaginate } from '../transport';

// Máximo de itens por página que a RD aceita nas rotas de segmentação.
export const SEGMENTATION_PAGE_SIZE = 125;

const properties: INodeProperties[] = [
	// Segmentação escolhida numa lista lida da conta, para ler os contatos dela.
	idLocator({
		name: 'segmentationId',
		displayName: 'Segmentation',
		resource: 'segmentation',
		operations: ['getContacts'],
		searchListMethod: 'searchSegmentations',
		description: 'The segmentation whose contacts to list',
		placeholder: 'e.g. 12345',
	}),
	// Busca por nome (a RD não inclui as segmentações padrão nesta busca).
	searchField('segmentation', ['getMany']),
	// Return All e Limit das duas listagens.
	...returnAllAndLimit('segmentation', ['getMany', 'getContacts']),
];

// Segmentation → Get Many.
const getMany: OperationHandler = async function (i) {
	// O texto de busca só vai quando preenchido, para não mandar `search=` vazio.
	const search = this.getNodeParameter('search', i, '') as string;
	return rdMarketingPaginate.call(this, '/platform/segmentations', {
		qs: search ? { search } : {},
		itemsKey: 'segmentations',
		pageSize: SEGMENTATION_PAGE_SIZE,
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		itemIndex: i,
	});
};

// Segmentation → Get Contacts.
const getContacts: OperationHandler = async function (i) {
	// `extractValue` devolve o texto do ID, venha ele da lista ou digitado.
	const id = this.getNodeParameter('segmentationId', i, '', { extractValue: true }) as string;
	// Sem segmentação escolhida a rota seria `/segmentations//contacts`.
	requireValue(this, i, id, 'Segmentation');
	return rdMarketingPaginate.call(this, `/platform/segmentations/${id}/contacts`, {
		itemsKey: 'contacts',
		pageSize: SEGMENTATION_PAGE_SIZE,
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		itemIndex: i,
	});
};

export const segmentationResource: ResourceModule = {
	value: 'segmentation',
	name: 'Segmentation',
	operationSelector: operationSelector(
		'segmentation',
		[
			{
				name: 'Get Contacts',
				value: 'getContacts',
				action: 'Get the contacts of a segmentation',
				description: 'Get the contacts that belong to a segmentation',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many segmentations',
				description: 'Get the segmentations of the account',
			},
		],
		'getMany',
	),
	properties,
	handlers: { getMany, getContacts },
};
