/**
 * Recurso Custom Field: listar, criar, atualizar e apagar os campos personalizados dos contatos.
 *
 * A RD devolve a lista inteira de uma vez (sem paginação) e guarda `name` e `label` como um objeto
 * por idioma. Todos os exemplos da RD usam só a chave `pt-BR`, então é ela que gravamos (premissa
 * registrada no plano).
 */
import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import { idLocator, operationSelector, returnAllAndLimit, showFor } from '../descriptions';
import { requireValue } from '../helpers';
import { rdMarketingApiRequest, rdMarketingPaginate } from '../transport';

// Campos de definição do campo personalizado, repetidos na criação e na atualização.
// Na atualização a RD exige os mesmos quatro campos, só não aceita trocar o `api_identifier`.
function definitionFields(operations: string[]): INodeProperties[] {
	return [
		{
			// Tipo do dado guardado; a RD não deixa trocar depois de criado, mas exige no PATCH.
			displayName: 'Data Type',
			name: 'dataType',
			type: 'options',
			options: [
				{ name: 'Boolean', value: 'BOOLEAN' },
				{ name: 'Integer', value: 'INTEGER' },
				{ name: 'String', value: 'STRING' },
				{ name: 'String List', value: 'STRING[]' },
			],
			default: 'STRING',
			description: 'Type of the value the field stores',
			displayOptions: showFor('customField', operations),
		},
		{
			// Nome interno do campo, mostrado na lista de campos da RD.
			displayName: 'Name',
			name: 'name',
			type: 'string',
			required: true,
			default: '',
			description: 'Name of the field in Brazilian Portuguese',
			displayOptions: showFor('customField', operations),
		},
		{
			// Rótulo que aparece nos formulários.
			displayName: 'Label',
			name: 'label',
			type: 'string',
			required: true,
			default: '',
			description: 'Label of the field in Brazilian Portuguese',
			displayOptions: showFor('customField', operations),
		},
		{
			// Como o campo aparece nos formulários da RD (lista fechada pela API, em ordem alfabética).
			displayName: 'Presentation Type',
			name: 'presentationType',
			type: 'options',
			options: [
				{ name: 'Check Box', value: 'CHECK_BOX' },
				{ name: 'Combo Box', value: 'COMBO_BOX' },
				{ name: 'Email Input', value: 'EMAIL_INPUT' },
				{ name: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
				{ name: 'Number Input', value: 'NUMBER_INPUT' },
				{ name: 'Phone Input', value: 'PHONE_INPUT' },
				{ name: 'Radio Button', value: 'RADIO_BUTTON' },
				{ name: 'Text Area', value: 'TEXT_AREA' },
				{ name: 'Text Input', value: 'TEXT_INPUT' },
				{ name: 'URL Input', value: 'URL_INPUT' },
			],
			default: 'TEXT_INPUT',
			description: 'How the field is shown in RD Station forms',
			displayOptions: showFor('customField', operations),
		},
	];
}

const properties: INodeProperties[] = [
	// Return All e Limit do Get Many.
	...returnAllAndLimit('customField', ['getMany']),
	{
		// Identificador usado na API (`cf_plano`); fica imutável depois da criação.
		displayName: 'API Identifier',
		name: 'apiIdentifier',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. cf_plan',
		description: 'Identifier used by the API. It must start with "cf_" and cannot be changed later.',
		displayOptions: showFor('customField', ['create']),
	},
	// Campo escolhido numa lista lida da conta, para atualizar ou apagar.
	idLocator({
		name: 'customFieldId',
		displayName: 'Custom Field',
		resource: 'customField',
		operations: ['update', 'delete'],
		searchListMethod: 'searchCustomFields',
		description: 'The custom field to change',
		placeholder: 'e.g. 3f2a0f6c-6b1e-4d6e-9f5a-0a1b2c3d4e5f',
	}),
	// Tipo, nome, rótulo e forma de exibição, comuns à criação e à atualização.
	...definitionFields(['create', 'update']),
];

// Monta o objeto por idioma que a RD espera em `name` e `label`.
const inPortuguese = (text: string): IDataObject => ({ 'pt-BR': text });

// Corpo comum da criação e da atualização (sem o `api_identifier`, que só a criação envia).
function definitionBody(context: IExecuteFunctions, i: number): IDataObject {
	return {
		// O tipo do dado vai como a RD o escreve (`STRING`, `STRING[]`...).
		data_type: context.getNodeParameter('dataType', i) as string,
		// Nome e rótulo viram `{ "pt-BR": "..." }`.
		name: inPortuguese(context.getNodeParameter('name', i) as string),
		label: inPortuguese(context.getNodeParameter('label', i) as string),
		presentation_type: context.getNodeParameter('presentationType', i) as string,
	};
}

// Custom Field → Get Many.
const getMany: OperationHandler = async function (i) {
	// A rota devolve todos os campos juntos, então não recebe `page`; o Limit corta aqui no node.
	return rdMarketingPaginate.call(this, '/platform/contacts/fields', {
		paginated: false,
		itemsKey: 'fields',
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		itemIndex: i,
	});
};

// Custom Field → Create.
const create: OperationHandler = async function (i) {
	// O identificador digitado pela pessoa.
	const apiIdentifier = this.getNodeParameter('apiIdentifier', i) as string;
	// A RD recusa identificador sem `cf_`; avisar antes poupa a ida à rede.
	if (!apiIdentifier.startsWith('cf_')) {
		throw new NodeOperationError(
			this.getNode(),
			`The 'API Identifier' must start with 'cf_' [item ${i}]`,
			{ itemIndex: i, description: 'Use a value like cf_plan' },
		);
	}
	// O identificador entra no corpo junto com a definição do campo.
	const body = { api_identifier: apiIdentifier, ...definitionBody(this, i) };
	return rdMarketingApiRequest.call(this, 'POST', '/platform/contacts/fields', {
		body,
		itemIndex: i,
	});
};

// Custom Field → Update.
const update: OperationHandler = async function (i) {
	// `extractValue` devolve o texto do ID, venha ele da lista ou digitado.
	const uuid = this.getNodeParameter('customFieldId', i, '', { extractValue: true }) as string;
	// Sem o campo escolhido a rota seria `/fields/`, que lista em vez de atualizar.
	requireValue(this, i, uuid, 'Custom Field');
	// O PATCH não leva `api_identifier`: a RD o trata como imutável.
	return rdMarketingApiRequest.call(this, 'PATCH', `/platform/contacts/fields/${uuid}`, {
		body: definitionBody(this, i),
		itemIndex: i,
	});
};

// Custom Field → Delete.
const remove: OperationHandler = async function (i) {
	const uuid = this.getNodeParameter('customFieldId', i, '', { extractValue: true }) as string;
	// Mesma proteção do Update: sem ID o DELETE cairia na rota da lista.
	requireValue(this, i, uuid, 'Custom Field');
	await rdMarketingApiRequest.call(this, 'DELETE', `/platform/contacts/fields/${uuid}`, {
		itemIndex: i,
	});
	// A RD responde 204 sem corpo; o item `deleted` deixa o workflow seguir.
	return { deleted: true };
};

export const customFieldResource: ResourceModule = {
	value: 'customField',
	name: 'Custom Field',
	operationSelector: operationSelector(
		'customField',
		[
			{
				name: 'Create',
				value: 'create',
				action: 'Create a custom field',
				description: 'Create a custom field for contacts',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a custom field',
				description: 'Delete a custom field',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many custom fields',
				description: 'Get the standard and custom fields of contacts',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a custom field',
				description: 'Update the name, label or type of a custom field',
			},
		],
		'getMany',
	),
	properties,
	// `delete` é o valor salvo no workflow; a função se chama `remove` porque `delete` é palavra reservada.
	handlers: { getMany, create, update, delete: remove },
};
