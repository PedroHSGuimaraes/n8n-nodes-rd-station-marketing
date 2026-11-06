/**
 * Recurso Analytics: os quatro relatórios da conta (e-mails, e-mails de fluxos, funil e conversões).
 *
 * Todos recebem um período, devolvem um envelope diferente e saem como um item por linha do
 * relatório. A RD limita cada um a 60 requisições por hora e alguns só existem nos planos Pro e
 * Advanced; o erro da RD chega ao usuário como veio.
 */
import type { IDataObject, INodeProperties } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import { dateRange, operationSelector, showFor } from '../descriptions';
import { assertDateRange, extractItems } from '../helpers';
import { rdMarketingApiRequest } from '../transport';

const REPORTS = ['getEmails', 'getWorkflowEmails', 'getFunnel', 'getConversions'];

const properties: INodeProperties[] = [
	// Período do relatório (a RD usa só a data, em UTC).
	...dateRange('analytics', REPORTS),
	{
		// Agrupamento do funil; a RD usa `daily` quando o parâmetro não vem.
		displayName: 'Grouped By',
		name: 'groupedBy',
		type: 'options',
		options: [
			{ name: 'Daily', value: 'daily' },
			{ name: 'Monthly', value: 'monthly' },
			{ name: 'Weekly', value: 'weekly' },
		],
		default: 'daily',
		description: 'How the funnel numbers are grouped over time',
		displayOptions: showFor('analytics', ['getFunnel']),
	},
	{
		// Tipos de ativo do relatório de conversões; vazio traz todos.
		displayName: 'Asset Types',
		name: 'assetsType',
		type: 'multiOptions',
		options: [
			{ name: 'Form', value: 'Forms' },
			{ name: 'Landing Page', value: 'LandingPage' },
			{ name: 'Popup', value: 'Popup' },
		],
		default: [],
		description: 'Only include conversions of these asset types',
		displayOptions: showFor('analytics', ['getConversions']),
	},
];

// Cria a função de um relatório: muda só a rota, a chave da lista na resposta e o filtro extra.
function report(
	path: string,
	itemsKey: string,
	extraQuery?: (read: (name: string, fallback?: unknown) => unknown) => IDataObject,
): OperationHandler {
	return async function (i) {
		// Confere as datas antes da ida à rede.
		const range = assertDateRange(
			this,
			i,
			this.getNodeParameter('startDate', i),
			this.getNodeParameter('endDate', i),
		);
		// Filtros próprios do relatório (agrupamento do funil, tipos de ativo das conversões).
		const extra = extraQuery?.((name, fallback) => this.getNodeParameter(name, i, fallback)) ?? {};
		const response = await rdMarketingApiRequest.call(this, 'GET', path, {
			qs: { ...range, ...extra },
			itemIndex: i,
		});
		// Um item por linha do relatório; a chave certa evita pegar outra lista do envelope.
		return extractItems(response, itemsKey);
	};
}

export const analyticsResource: ResourceModule = {
	value: 'analytics',
	name: 'Analytics',
	operationSelector: operationSelector(
		'analytics',
		[
			{
				name: 'Get Conversions',
				value: 'getConversions',
				action: 'Get the conversions report',
				description: 'Get the conversions of landing pages, pop-ups and forms',
			},
			{
				name: 'Get Emails',
				value: 'getEmails',
				action: 'Get the email report',
				description: 'Get the performance of the email campaigns',
			},
			{
				name: 'Get Funnel',
				value: 'getFunnel',
				action: 'Get the funnel report',
				description: 'Get the visitors, leads, opportunities and sales of the funnel',
			},
			{
				name: 'Get Workflow Emails',
				value: 'getWorkflowEmails',
				action: 'Get the automation flow email report',
				description: 'Get the performance of the emails sent by automation flows',
			},
		],
		'getEmails',
	),
	properties,
	handlers: {
		getEmails: report('/platform/analytics/emails', 'emails'),
		getWorkflowEmails: report('/platform/analytics/workflow_emails', 'workflow_email_statistics'),
		getFunnel: report('/platform/analytics/funnel', 'funnel', (read) => ({
			grouped_by: read('groupedBy', 'daily') as string,
		})),
		getConversions: report('/platform/analytics/conversions', 'conversions', (read) => {
			const types = read('assetsType', []) as string[];
			// A RD repete a chave com colchetes (`assets_type[]=A&assets_type[]=B`); só vai se houver tipos.
			return types.length > 0 ? { 'assets_type[]': types } : {};
		}),
	},
};
