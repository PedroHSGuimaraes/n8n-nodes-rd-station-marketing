/**
 * Recurso Product Catalog: cadastra e gerencia o feed de produtos da conta.
 *
 * A RD permite um catálogo por conta e o bloqueia quando há integração nativa (Shopify, Tray, VTEX).
 * A lista vem como array na raiz, sem paginação.
 */
import type { INodeProperties } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import { idLocator, operationSelector, returnAllAndLimit, showFor } from '../descriptions';
import { compact, requireValue } from '../helpers';
import { rdMarketingApiRequest, rdMarketingPaginate } from '../transport';

const properties: INodeProperties[] = [
	// Catálogo escolhido numa lista lida da conta.
	idLocator({
		name: 'catalogId',
		displayName: 'Product Catalog',
		resource: 'productCatalog',
		operations: ['get', 'update', 'delete'],
		searchListMethod: 'searchCatalogs',
		description: 'The product catalog to work with',
		placeholder: 'e.g. 12345',
	}),
	{
		// Nome do catálogo, obrigatório na criação e na atualização.
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'Name of the product catalog',
		displayOptions: showFor('productCatalog', ['create', 'update']),
	},
	{
		// Endereço do arquivo de produtos que a RD vai ler.
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/feed.json',
		description: 'URL of the product feed',
		displayOptions: showFor('productCatalog', ['create', 'update']),
	},
	{
		// Formato do feed; a RD aceita só estes três.
		displayName: 'Format',
		name: 'format',
		type: 'options',
		options: [
			{ name: 'Google Shopping', value: 'google_shopping' },
			{ name: 'JSON', value: 'json' },
			{ name: 'XML', value: 'xml' },
		],
		default: 'json',
		description: 'Format of the product feed',
		displayOptions: showFor('productCatalog', ['create', 'update']),
	},
	{
		// Usuário e senha opcionais, para feeds protegidos por Basic Auth HTTP.
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor('productCatalog', ['create', 'update']),
		options: [
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Password for feeds protected with HTTP Basic Auth',
			},
			{
				displayName: 'Username',
				name: 'username',
				type: 'string',
				default: '',
				description: 'Username for feeds protected with HTTP Basic Auth',
			},
		],
	},
	// Return All e Limit da lista (sem paginação na RD).
	...returnAllAndLimit('productCatalog', ['getMany']),
];

// Lê o ID do catálogo escolhido; falha se a pessoa não escolheu nenhum.
const catalogIdOf = (context: Parameters<typeof requireValue>[0], i: number): string => {
	// `extractValue` devolve o texto do ID, venha ele da lista ou digitado.
	const id = context.getNodeParameter('catalogId', i, '', { extractValue: true }) as string;
	requireValue(context, i, id, 'Product Catalog');
	return id;
};

// Corpo comum da criação e da atualização; usuário e senha vazios não vão.
const feedBody = (context: Parameters<typeof requireValue>[0], i: number) => {
	const extra = context.getNodeParameter('additionalFields', i, {}) as Record<string, string>;
	return compact({
		name: context.getNodeParameter('name', i) as string,
		url: context.getNodeParameter('url', i) as string,
		format: context.getNodeParameter('format', i) as string,
		username: extra.username,
		password: extra.password,
	});
};

// Product Catalog → Create.
const create: OperationHandler = async function (i) {
	return rdMarketingApiRequest.call(this, 'POST', '/platform/catalog_feeds', {
		body: feedBody(this, i),
		itemIndex: i,
	});
};

// Product Catalog → Get.
const get: OperationHandler = async function (i) {
	return rdMarketingApiRequest.call(
		this,
		'GET',
		`/platform/catalog_feeds/${catalogIdOf(this, i)}`,
		{
			itemIndex: i,
		},
	);
};

// Product Catalog → Get Many: a RD devolve todos de uma vez, como array na raiz.
const getMany: OperationHandler = async function (i) {
	return rdMarketingPaginate.call(this, '/platform/catalog_feeds', {
		paginated: false,
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		itemIndex: i,
	});
};

// Product Catalog → Update.
const update: OperationHandler = async function (i) {
	return rdMarketingApiRequest.call(
		this,
		'PATCH',
		`/platform/catalog_feeds/${catalogIdOf(this, i)}`,
		{
			body: feedBody(this, i),
			itemIndex: i,
		},
	);
};

// Product Catalog → Delete.
const remove: OperationHandler = async function (i) {
	await rdMarketingApiRequest.call(
		this,
		'DELETE',
		`/platform/catalog_feeds/${catalogIdOf(this, i)}`,
		{
			itemIndex: i,
		},
	);
	// A RD responde 204 sem corpo; o item `deleted` deixa o workflow seguir.
	return { deleted: true };
};

export const productCatalogResource: ResourceModule = {
	value: 'productCatalog',
	name: 'Product Catalog',
	operationSelector: operationSelector(
		'productCatalog',
		[
			{
				name: 'Create',
				value: 'create',
				action: 'Create a product catalog',
				description: 'Register the product feed of the account',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a product catalog',
				description: 'Delete a product catalog',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a product catalog',
				description: 'Get a product catalog',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many product catalogs',
				description: 'Get the product catalogs of the account',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a product catalog',
				description: 'Change the feed of a product catalog',
			},
		],
		'getMany',
	),
	properties,
	handlers: { create, get, getMany, update, delete: remove },
};
