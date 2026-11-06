/**
 * Recursos de ativos de marketing: Email, Landing Page, Pop-up e Form.
 *
 * Os quatro só leem dados da conta. Landing page, pop-up e formulário têm a mesma rota de lista
 * mudando só o caminho, então saem de uma fábrica; e-mail tem busca (`query`) e leitura por ID.
 */
import type { INodeProperties } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import { idLocator, operationSelector, returnAllAndLimit, searchField } from '../descriptions';
import { requireValue } from '../helpers';
import { rdMarketingApiRequest, rdMarketingPaginate } from '../transport';

// A RD só documenta o tamanho máximo de página para segmentações e campanhas; nas demais listas
// usamos 50, o mesmo padrão das campanhas (premissa registrada no plano).
const ASSET_PAGE_SIZE = 50;

// Cria o recurso de uma lista simples (landing page, pop-up ou formulário): só "Get Many".
function simpleListResource(
	value: string,
	name: string,
	path: string,
	plural: string,
): ResourceModule {
	// Propriedades: busca por nome e Return All + Limit.
	const properties: INodeProperties[] = [
		searchField(value, ['getMany']),
		...returnAllAndLimit(value, ['getMany']),
	];
	// A função lê a lista; a RD não documenta o envelope, então a extração aceita array ou objeto.
	const getMany: OperationHandler = async function (i) {
		const search = this.getNodeParameter('search', i, '') as string;
		return rdMarketingPaginate.call(this, path, {
			qs: search ? { search } : {},
			pageSize: ASSET_PAGE_SIZE,
			returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
			limit: this.getNodeParameter('limit', i, 50) as number,
			itemIndex: i,
		});
	};
	return {
		value,
		name,
		operationSelector: operationSelector(
			value,
			[
				{
					name: 'Get Many',
					value: 'getMany',
					action: `Get many ${plural}`,
					description: `Get the ${plural} of the account`,
				},
			],
			'getMany',
		),
		properties,
		handlers: { getMany },
	};
}

export const landingPageResource = simpleListResource(
	'landingPage',
	'Landing Page',
	'/platform/landing_pages',
	'landing pages',
);
export const popupResource = simpleListResource('popup', 'Popup', '/platform/popups', 'popups');
export const formResource = simpleListResource('form', 'Form', '/platform/embeddables', 'forms');

const emailProperties: INodeProperties[] = [
	// E-mail escolhido numa lista lida da conta.
	idLocator({
		name: 'emailId',
		displayName: 'Email',
		resource: 'email',
		operations: ['get'],
		searchListMethod: 'searchEmails',
		description: 'The email to read',
		placeholder: 'e.g. 12345',
	}),
	// Busca por nome do e-mail (na RD o parâmetro se chama `query`).
	searchField('email', ['getMany']),
	// Return All e Limit da lista de e-mails.
	...returnAllAndLimit('email', ['getMany']),
];

// Email → Get Many: a RD devolve `{ items, total }`.
const getManyEmails: OperationHandler = async function (i) {
	const search = this.getNodeParameter('search', i, '') as string;
	return rdMarketingPaginate.call(this, '/platform/emails', {
		qs: search ? { query: search } : {},
		itemsKey: 'items',
		pageSize: ASSET_PAGE_SIZE,
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		itemIndex: i,
	});
};

// Email → Get: o ID do e-mail é um número, mas o caminho o aceita como texto.
const getEmail: OperationHandler = async function (i) {
	const id = this.getNodeParameter('emailId', i, '', { extractValue: true }) as string;
	// Sem e-mail escolhido a rota seria a da lista.
	requireValue(this, i, id, 'Email');
	return rdMarketingApiRequest.call(this, 'GET', `/platform/emails/${id}`, { itemIndex: i });
};

export const emailResource: ResourceModule = {
	value: 'email',
	name: 'Email',
	operationSelector: operationSelector(
		'email',
		[
			{
				name: 'Get',
				value: 'get',
				action: 'Get an email',
				description: 'Get the details of an email',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many emails',
				description: 'Get the emails of the account',
			},
		],
		'getMany',
	),
	properties: emailProperties,
	handlers: { get: getEmail, getMany: getManyEmails },
};
