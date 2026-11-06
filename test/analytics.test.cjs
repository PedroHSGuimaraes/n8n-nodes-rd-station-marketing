/**
 * Testes do recurso Analytics (checks C56 a C60): os quatro relatórios da conta, um item por linha.
 * O envelope muda a cada relatório e o de conversões ainda traz uma lista `assets_type` que
 * confundiria uma extração "primeira lista", por isso cada relatório tem a sua chave testada.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { executarJson } = require('./contexto.cjs');

const datas = { startDate: '2026-10-01', endDate: '2026-10-31' };

describe('Analytics', () => {
	it('C56 - Get Emails envia as datas e devolve 1 item por elemento de emails', async () => {
		const { json, requisicoes } = await executarJson(
			{ resource: 'analytics', operation: 'getEmails', ...datas },
			() => ({ account_id: 1, query_date: {}, emails: [{ campaign_id: 1 }, { campaign_id: 2 }] }),
		);
		assert.equal(requisicoes[0].url, '/platform/analytics/emails');
		assert.equal(requisicoes[0].qs.start_date, '2026-10-01');
		assert.equal(requisicoes[0].qs.end_date, '2026-10-31');
		assert.equal(json.length, 2);
	});

	it('C57 - Workflow Emails, Funnel e Conversions chamam as 3 rotas e devolvem 1 item por linha', async () => {
		const casos = [
			['getWorkflowEmails', '/platform/analytics/workflow_emails', { workflow_email_statistics: [{ a: 1 }, { a: 2 }] }],
			['getFunnel', '/platform/analytics/funnel', { funnel: [{ a: 1 }, { a: 2 }] }],
			// A lista `assets_type` vem antes de `conversions`: só a chave certa acerta.
			['getConversions', '/platform/analytics/conversions', { assets_type: ['Popup'], conversions: [{ a: 1 }, { a: 2 }] }],
		];
		for (const [operation, rota, resposta] of casos) {
			const { json, requisicoes } = await executarJson(
				{ resource: 'analytics', operation, ...datas },
				() => resposta,
			);
			assert.equal(requisicoes[0].url, rota, operation);
			assert.equal(json.length, 2, operation);
		}
	});

	it('C58 - Get Funnel envia grouped_by weekly e, no padrão, daily', async () => {
		const semanal = await executarJson(
			{ resource: 'analytics', operation: 'getFunnel', ...datas, groupedBy: 'weekly' },
			() => ({ funnel: [] }),
		);
		assert.equal(semanal.requisicoes[0].qs.grouped_by, 'weekly');
		const padrao = await executarJson(
			{ resource: 'analytics', operation: 'getFunnel', ...datas },
			() => ({ funnel: [] }),
		);
		assert.equal(padrao.requisicoes[0].qs.grouped_by, 'daily');
	});

	it('C59 - Get Conversions envia assets_type[] repetido para LandingPage e Popup', async () => {
		const { requisicoes } = await executarJson(
			{ resource: 'analytics', operation: 'getConversions', ...datas, assetsType: ['LandingPage', 'Popup'] },
			() => ({ conversions: [] }),
		);
		assert.deepEqual(requisicoes[0].qs['assets_type[]'], ['LandingPage', 'Popup']);
		// `repeat` faz o n8n escrever assets_type[]=LandingPage&assets_type[]=Popup, o formato da RD.
		assert.equal(requisicoes[0].arrayFormat, 'repeat');
	});

	it('C60 - nas 4 operações, endDate antes de startDate lança o erro do plano sem chamar a RD', async () => {
		for (const operation of ['getEmails', 'getWorkflowEmails', 'getFunnel', 'getConversions']) {
			await assert.rejects(
				executarJson(
					{ resource: 'analytics', operation, startDate: '2026-10-31', endDate: '2026-10-01' },
					() => {
						throw new Error('não devia chamar a RD');
					},
				),
				(erro) => {
					assert.equal(erro.message, "The 'End Date' is before the 'Start Date' [item 0]");
					return true;
				},
				operation,
			);
		}
	});
});
