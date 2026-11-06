/**
 * Recurso Automation Flow: listar fluxos de automação, ler um fluxo, inserir leads e consultar
 * quem entrou, saiu ou executou uma ação.
 *
 * As rotas de fluxo têm limites de requisição por hora muito baixos (de 1 a 40 por hora, conforme
 * o plano), por isso as validações (datas, campos vazios) rodam antes de qualquer chamada.
 */
import type { IDataObject, INodeProperties } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import {
	dateRange,
	idLocator,
	operationSelector,
	returnAllAndLimit,
	showFor,
} from '../descriptions';
import { assertDateRange, requireValue, splitList } from '../helpers';
import { rdMarketingApiRequest, rdMarketingPaginate } from '../transport';

// Tamanho de página dos relatórios de leads: 25 é o máximo do plano mais baixo (premissa do plano).
const LEADS_PAGE_SIZE = 25;
// A RD não documenta máximo para a lista de fluxos; 50 é o padrão adotado em todas as listas sem limite.
const WORKFLOWS_PAGE_SIZE = 50;

// Operações que trabalham sobre um fluxo já escolhido.
const WITH_WORKFLOW = ['get', 'addLeads', 'getLeadsStarted', 'getLeadsLeft', 'getActionExecuted'];
// As três consultas de leads por período.
const LEAD_REPORTS = ['getLeadsStarted', 'getLeadsLeft', 'getActionExecuted'];

const properties: INodeProperties[] = [
	// Fluxo escolhido numa lista lida da conta.
	idLocator({
		name: 'workflowId',
		displayName: 'Automation Flow',
		resource: 'automationFlow',
		operations: WITH_WORKFLOW,
		searchListMethod: 'searchWorkflows',
		description: 'The automation flow to work with',
		placeholder: 'e.g. 3f2a0f6c-6b1e-4d6e-9f5a-0a1b2c3d4e5f',
	}),
	{
		// Ação do fluxo; a lista vem da rota do fluxo escolhido e muda quando ele muda.
		displayName: 'Action Name or ID',
		name: 'actionId',
		type: 'options',
		required: true,
		typeOptions: { loadOptionsMethod: 'getWorkflowActions', loadOptionsDependsOn: ['workflowId'] },
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: showFor('automationFlow', ['getActionExecuted']),
	},
	{
		// E-mails ou telefones dos leads a inserir; a RD limita o número por requisição conforme o plano.
		displayName: 'Leads',
		name: 'leads',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. name@email.com, +5511987654321',
		description: 'Comma-separated emails or phones (E.164 format) of the leads to insert',
		displayOptions: showFor('automationFlow', ['addLeads']),
	},
	// Início e fim do período das consultas de leads.
	...dateRange('automationFlow', LEAD_REPORTS),
	// Return All e Limit da lista de fluxos e dos relatórios de leads.
	...returnAllAndLimit('automationFlow', ['getMany', ...LEAD_REPORTS]),
];

// Automation Flow → Get Many.
const getMany: OperationHandler = async function (i) {
	// A lista vem no envelope `wokflows` (grafado errado pela RD); a extração pega a primeira lista.
	return rdMarketingPaginate.call(this, '/platform/workflows', {
		pageSize: WORKFLOWS_PAGE_SIZE,
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		itemIndex: i,
	});
};

// Automation Flow → Get.
const get: OperationHandler = async function (i) {
	const id = this.getNodeParameter('workflowId', i, '', { extractValue: true }) as string;
	requireValue(this, i, id, 'Automation Flow');
	const response = await rdMarketingApiRequest.call(this, 'GET', `/platform/workflows/${id}`, {
		itemIndex: i,
	});
	// A RD embrulha os dados em `workflow_info`; devolvemos o conteúdo.
	return (response.workflow_info as IDataObject | undefined) ?? response;
};

// Automation Flow → Add Leads.
const addLeads: OperationHandler = async function (i) {
	const id = this.getNodeParameter('workflowId', i, '', { extractValue: true }) as string;
	requireValue(this, i, id, 'Automation Flow');
	const leads = splitList(this.getNodeParameter('leads', i));
	// Lista vazia faria a RD responder 400 depois de gastar uma das poucas requisições por hora.
	requireValue(this, i, leads, 'Leads');
	return rdMarketingApiRequest.call(this, 'POST', `/platform/workflows/${id}/leads`, {
		body: { leads },
		itemIndex: i,
	});
};

// Cria a função das três consultas de leads, que mudam só a rota e a chave da lista na resposta.
function leadReport(
	route: (context: { actionId: string }) => string,
	itemsKey: string,
	needsAction = false,
): OperationHandler {
	return async function (i) {
		const id = this.getNodeParameter('workflowId', i, '', { extractValue: true }) as string;
		requireValue(this, i, id, 'Automation Flow');
		// A ação só existe na consulta "Action Executed".
		const actionId = needsAction ? (this.getNodeParameter('actionId', i) as string) : '';
		if (needsAction) requireValue(this, i, actionId, 'Action');
		// Confere as datas antes da ida à rede.
		const range = assertDateRange(
			this,
			i,
			this.getNodeParameter('startDate', i),
			this.getNodeParameter('endDate', i),
		);
		return rdMarketingPaginate.call(this, `/platform/workflows/${id}/leads/${route({ actionId })}`, {
			qs: range,
			itemsKey,
			pageSize: LEADS_PAGE_SIZE,
			returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
			limit: this.getNodeParameter('limit', i, 50) as number,
			itemIndex: i,
		});
	};
}

export const automationFlowResource: ResourceModule = {
	value: 'automationFlow',
	name: 'Automation Flow',
	operationSelector: operationSelector(
		'automationFlow',
		[
			{
				name: 'Add Leads',
				value: 'addLeads',
				action: 'Add leads to an automation flow',
				description: 'Insert leads into an automation flow',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get an automation flow',
				description: 'Get the details and actions of an automation flow',
			},
			{
				name: 'Get Action Executed',
				value: 'getActionExecuted',
				action: 'Get the leads that executed an action',
				description: 'Get the leads that executed an action of a flow in a period',
			},
			{
				name: 'Get Leads Left',
				value: 'getLeadsLeft',
				action: 'Get the leads that left a flow',
				description: 'Get the leads that left a flow in a period',
			},
			{
				name: 'Get Leads Started',
				value: 'getLeadsStarted',
				action: 'Get the leads that started a flow',
				description: 'Get the leads that entered a flow in a period',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many automation flows',
				description: 'Get the automation flows of the account',
			},
		],
		'getMany',
	),
	properties,
	handlers: {
		getMany,
		get,
		addLeads,
		getLeadsStarted: leadReport(() => 'started', 'leads'),
		getLeadsLeft: leadReport(() => 'left', 'leads_left_details.leads'),
		getActionExecuted: leadReport(({ actionId }) => `action/${actionId}`, 'leads', true),
	},
};
