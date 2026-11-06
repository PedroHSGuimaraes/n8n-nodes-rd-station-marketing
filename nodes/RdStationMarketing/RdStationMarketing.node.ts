/**
 * Node de ação do RD Station Marketing.
 *
 * Este arquivo só monta a tela (junta as propriedades de todos os recursos) e despacha a execução:
 * lê `resource` e `operation` de cada item e chama a função do recurso. A regra de cada operação
 * (rota, query, corpo, validação) mora em `resources/`, e o transporte HTTP em `transport.ts`.
 * O estilo é programático porque a RD devolve a lista em envelopes diferentes por rota e o delete
 * responde 204 sem corpo, o que o estilo declarativo não consegue tratar (decisão AD-005).
 */
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type { OperationHandler } from './descriptions';
import {
	getCustomFieldNames,
	getWorkflowActions,
	searchCampaigns,
	searchCatalogs,
	searchCustomFields,
	searchEmails,
	searchSegmentations,
	searchWebhooks,
	searchWorkflows,
} from './methods';
import { RESOURCES } from './resources';

// Tabela `recurso → operação → função`, montada uma vez a partir do registro de recursos.
const HANDLERS: Record<string, Record<string, OperationHandler>> = Object.fromEntries(
	RESOURCES.map((resource) => [resource.value, resource.handlers]),
);

export class RdStationMarketing implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'RD Station Marketing',
		// Nome persistido nos workflows salvos: não pode mudar depois do lançamento (porta de uma via).
		name: 'rdStationMarketing',
		icon: { light: 'file:rdStationMarketing.svg', dark: 'file:rdStationMarketing.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Work with contacts, segmentations, automation flows, events and more in RD Station Marketing',
		defaults: { name: 'RD Station Marketing' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		// Permite o agente de IA do n8n usar este node como ferramenta (decisão AD-005).
		usableAsTool: true,
		credentials: [
			{
				// OAuth2 serve todas as operações. Só fica de fora quando a pessoa escolhe a chave de API
				// em Send Conversion; `hide` (e não `show`) mantém a credencial pedida nas demais
				// operações, onde o seletor de autenticação não existe.
				name: 'rdStationMarketingOAuth2Api',
				required: true,
				displayOptions: { hide: { authentication: ['apiKey'] } },
			},
			{
				// A chave de API só vale para a conversão.
				name: 'rdStationMarketingApi',
				required: true,
				displayOptions: { show: { authentication: ['apiKey'] } },
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: RESOURCES.map((resource) => ({ name: resource.name, value: resource.value })),
				default: 'contact',
			},
			// Para cada recurso: o seletor de operação e os campos dele.
			...RESOURCES.flatMap((resource) => [resource.operationSelector, ...resource.properties]),
		],
	};

	// Listas do editor: `listSearch` alimenta os IDs "From list" e `loadOptions` os dropdowns simples.
	methods = {
		listSearch: {
			searchCampaigns,
			searchCatalogs,
			searchCustomFields,
			searchEmails,
			searchSegmentations,
			searchWebhooks,
			searchWorkflows,
		},
		loadOptions: { getCustomFieldNames, getWorkflowActions },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];

		// Cada item de entrada roda sozinho, para um erro num item não impedir os outros com Continue On Fail.
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const handler = HANDLERS[resource]?.[operation];
				// Combinação desconhecida só acontece com workflow editado à mão ou versão futura.
				if (!handler) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for "${resource}" [item ${i}]`,
						{ itemIndex: i },
					);
				}
				const result = await handler.call(this, i);
				// Uma lista vira um item por elemento; um objeto vira um item; `undefined` não gera item.
				const records: IDataObject[] = Array.isArray(result) ? result : result ? [result] : [];
				output.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(records), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				// Continue On Fail: devolve o erro como item e segue para o próximo.
				if (this.continueOnFail()) {
					output.push(
						...this.helpers.constructExecutionMetaData(
							this.helpers.returnJsonArray({ error: (error as Error).message }),
							{ itemData: { item: i } },
						),
					);
					continue;
				}
				// Erros já traduzidos passam como estão; qualquer outro vira NodeOperationError com o item.
				throw error instanceof NodeApiError || error instanceof NodeOperationError
					? error
					: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [output];
	}
}
