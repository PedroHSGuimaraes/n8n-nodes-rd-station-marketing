/**
 * Construtores das propriedades do node de ação.
 *
 * Cada recurso (contato, segmentação, evento...) repete os mesmos tipos de campo: seletor de
 * operação, Return All + Limit, ID escolhido de uma lista e intervalo de datas. Estes construtores
 * dão a todos eles a mesma forma, que é a que a UX guideline do n8n pede, e evitam que cada recurso
 * reescreva (e erre) o `displayOptions`.
 */
import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

// Função que executa uma operação para o item `itemIndex` e devolve o que vira saída do node:
// um objeto (1 item), uma lista (1 item por elemento) ou `undefined` (nenhum item).
export type OperationHandler = (
	this: IExecuteFunctions,
	itemIndex: number,
) => Promise<IDataObject | IDataObject[] | undefined>;

// Tudo o que um recurso entrega ao node: como ele aparece na tela e como cada operação roda.
export interface ResourceModule {
	// Valor salvo no workflow (`resource`) e rótulo mostrado na lista de recursos.
	value: string;
	name: string;
	// Seletor de operação e campos da tela, já com `displayOptions` presos a este recurso.
	operationSelector: INodeProperties;
	properties: INodeProperties[];
	// Uma função por valor de `operation`.
	handlers: Record<string, OperationHandler>;
}

export interface OperationOption {
	name: string;
	value: string;
	action: string;
	description: string;
}

// Seletor "Operation" de um recurso. `noDataExpression` impede expressão: a operação define quais
// campos aparecem, então precisa ser um valor fixo.
export function operationSelector(
	resource: string,
	options: OperationOption[],
	defaultValue: string,
): INodeProperties {
	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options,
		default: defaultValue,
	};
}

// Atalho para o `displayOptions` de campos que valem para um recurso e algumas operações.
export function showFor(resource: string, operations: string[]): INodeProperties['displayOptions'] {
	return { show: { resource: [resource], operation: operations } };
}

// Par "Return All" + "Limit": todo "Get Many" tem os dois, como pede a UX guideline do n8n.
export function returnAllAndLimit(resource: string, operations: string[]): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: showFor(resource, operations),
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1 },
			description: 'Max number of results to return',
			displayOptions: {
				show: { resource: [resource], operation: operations, returnAll: [false] },
			},
		},
	];
}

export interface LocatorOptions {
	name: string;
	displayName: string;
	resource: string;
	operations: string[];
	// Nome do método `listSearch` que alimenta a lista.
	searchListMethod: string;
	description: string;
	placeholder: string;
}

// ID escolhido de uma lista pesquisável (modo padrão) ou digitado. É o padrão da UX guideline do n8n
// para todo ID que tem rota de listagem, e o tipo fica salvo no workflow (porta de uma via).
export function idLocator(options: LocatorOptions): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: options.description,
		displayOptions: showFor(options.resource, options.operations),
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select...',
				typeOptions: { searchListMethod: options.searchListMethod, searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: options.placeholder,
			},
		],
	};
}

// Intervalo de datas obrigatório das listagens que a RD filtra por período.
export function dateRange(resource: string, operations: string[]): INodeProperties[] {
	return [
		{
			displayName: 'Start Date',
			name: 'startDate',
			type: 'dateTime',
			required: true,
			default: '',
			description: 'First day of the period (only the date is used)',
			displayOptions: showFor(resource, operations),
		},
		{
			displayName: 'End Date',
			name: 'endDate',
			type: 'dateTime',
			required: true,
			default: '',
			description: 'Last day of the period (only the date is used)',
			displayOptions: showFor(resource, operations),
		},
	];
}

// Campo de busca por nome das listagens.
export function searchField(resource: string, operations: string[]): INodeProperties {
	return {
		displayName: 'Search',
		name: 'search',
		type: 'string',
		default: '',
		placeholder: 'e.g. welcome',
		description: 'Only return records whose name contains this text',
		displayOptions: showFor(resource, operations),
	};
}

// Campos "Custom Field" + valor, usados onde a RD aceita campos `cf_*` (contato e conversão).
export function customFieldsCollection(resource: string, operations: string[]): INodeProperties {
	return {
		displayName: 'Custom Fields',
		name: 'customFields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		placeholder: 'Add Custom Field',
		description: 'Custom fields of your RD Station account to set on the contact',
		displayOptions: showFor(resource, operations),
		options: [
			{
				displayName: 'Field',
				name: 'values',
				values: [
					{
						displayName: 'Field Name or ID',
						name: 'field',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getCustomFieldNames' },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Value to store in the custom field',
					},
				],
			},
		],
	};
}
