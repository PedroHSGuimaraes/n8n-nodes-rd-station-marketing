/**
 * Testes dos recursos Segmentation e Automation Flow (checks C40 a C48).
 *
 * Protegem as regras que mudam a saída: o tamanho de página de 125 das segmentações, a chave
 * `wokflows` (grafada errado pela RD), os três relatórios de leads de um fluxo e a checagem de
 * datas antes de gastar uma das poucas requisições por hora que a RD permite nessas rotas.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { contexto, erroHttp, executarJson } = require('./contexto.cjs');

const registros = (quantos, prefixo = 'x') =>
	Array.from({ length: quantos }, (_, n) => ({ id: `${prefixo}${n}`, name: `${prefixo} ${n}` }));

describe('Segmentation', () => {
	it('C40 - Get Many com Return All usa page_size 125 e pagina até vir página curta', async () => {
		// 125 + 40: duas chamadas e 165 itens.
		const curta = await executarJson(
			{ resource: 'segmentation', operation: 'getMany', returnAll: true },
			(_o, n) => ({ segmentations: n === 1 ? registros(125) : registros(40, 'b') }),
		);
		assert.equal(curta.requisicoes.length, 2);
		assert.equal(curta.json.length, 165);
		assert.equal(curta.requisicoes[0].url, '/platform/segmentations');
		assert.deepEqual(
			curta.requisicoes.map((r) => [r.qs.page, r.qs.page_size]),
			[
				[1, 125],
				[2, 125],
			],
		);
		// 125 + 0: a segunda chamada confirma que acabou, então também são 2 chamadas e 125 itens.
		const cheia = await executarJson(
			{ resource: 'segmentation', operation: 'getMany', returnAll: true },
			(_o, n) => ({ segmentations: n === 1 ? registros(125) : [] }),
		);
		assert.equal(cheia.requisicoes.length, 2);
		assert.equal(cheia.json.length, 125);
	});

	it('C41 - Get Contacts chama GET /platform/segmentations/<id>/contacts e devolve 1 item por contato', async () => {
		const { json, requisicoes } = await executarJson(
			{
				resource: 'segmentation',
				operation: 'getContacts',
				segmentationId: '12',
				returnAll: false,
				limit: 2,
			},
			() => ({ contacts: [{ uuid: 'a' }, { uuid: 'b' }, { uuid: 'c' }] }),
		);
		assert.equal(requisicoes[0].url, '/platform/segmentations/12/contacts');
		assert.equal(json.length, 2);
		assert.equal(json[0].uuid, 'a');
	});

	it('C42 - o listSearch envia search=leads, devolve { name, value: id } e inclui os ids 1 a 5 sem busca', async () => {
		const {
			RdStationMarketing,
		} = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
		const busca = new RdStationMarketing().methods.listSearch.searchSegmentations;
		const comTexto = contexto({}, () => ({ segmentations: [{ id: 77, name: 'Leads quentes' }] }));
		const achados = await busca.call(comTexto, 'leads');
		assert.equal(comTexto.requisicoes[0].qs.search, 'leads');
		assert.deepEqual(achados.results, [{ name: 'Leads quentes', value: '77' }]);

		const semTexto = contexto({}, () => ({ segmentations: [{ id: 77, name: 'Leads quentes' }] }));
		const todas = await busca.call(semTexto, undefined);
		assert.deepEqual(
			todas.results.slice(0, 5).map((r) => r.value),
			['1', '2', '3', '4', '5'],
		);
		assert.equal(todas.results[5].value, '77');
	});
});

describe('Automation Flow', () => {
	const base = { resource: 'automationFlow', workflowId: 'wf-1' };
	const datas = { startDate: '2026-11-01', endDate: '2026-11-05' };

	it('C43 - Get Many extrai os itens da chave wokflows (grafada errado)', async () => {
		const { json, requisicoes } = await executarJson(
			{ resource: 'automationFlow', operation: 'getMany', returnAll: true },
			() => ({
				wokflows: [
					{ id: 'a', name: 'A' },
					{ id: 'b', name: 'B' },
				],
			}),
		);
		assert.equal(requisicoes[0].url, '/platform/workflows');
		assert.equal(json.length, 2);
		assert.equal(json[1].name, 'B');
	});

	it('C44 - Get chama GET /platform/workflows/<id> e devolve workflow_info', async () => {
		const { json, requisicoes } = await executarJson({ ...base, operation: 'get' }, () => ({
			workflow_info: { id: 'wf-1', name: 'Boas-vindas', actions: [{ id: 9, type: 'SDEMA' }] },
		}));
		assert.equal(requisicoes[0].url, '/platform/workflows/wf-1');
		assert.deepEqual(json, [
			{ id: 'wf-1', name: 'Boas-vindas', actions: [{ id: 9, type: 'SDEMA' }] },
		]);
	});

	it('C45 - Add Leads envia { leads } e devolve leads_added e leads_not_found', async () => {
		const resposta = { leads_added: ['a@example.com'], leads_not_found: ['+5511987654321'] };
		const { json, requisicoes } = await executarJson(
			{ ...base, operation: 'addLeads', leads: 'a@example.com, +5511987654321' },
			() => resposta,
		);
		assert.equal(requisicoes[0].method, 'POST');
		assert.equal(requisicoes[0].url, '/platform/workflows/wf-1/leads');
		assert.deepEqual(requisicoes[0].body, { leads: ['a@example.com', '+5511987654321'] });
		assert.deepEqual(json, [resposta]);
	});

	it('C46 - Started, Left e Action Executed chamam as 3 rotas de leads com as datas', async () => {
		const casos = [
			[
				'getLeadsStarted',
				{},
				'/platform/workflows/wf-1/leads/started',
				{ leads: [{ email: 'a' }, { email: 'b' }] },
			],
			[
				'getLeadsLeft',
				{},
				'/platform/workflows/wf-1/leads/left',
				{ leads_left_details: { total_count: 2, leads: [{ email: 'a' }, { email: 'b' }] } },
			],
			[
				'getActionExecuted',
				{ actionId: '9' },
				'/platform/workflows/wf-1/leads/action/9',
				{ leads: [{ email: 'a' }, { email: 'b' }] },
			],
		];
		for (const [operation, extra, rota, resposta] of casos) {
			const { json, requisicoes } = await executarJson(
				{ ...base, operation, ...datas, ...extra, returnAll: false, limit: 25 },
				() => resposta,
			);
			assert.equal(requisicoes[0].url, rota, operation);
			assert.equal(requisicoes[0].qs.start_date, '2026-11-01', operation);
			assert.equal(requisicoes[0].qs.end_date, '2026-11-05', operation);
			assert.equal(json.length, 2, operation);
		}
	});

	it('C47 - endDate antes de startDate lança o erro do plano sem chamar a RD', async () => {
		await assert.rejects(
			executarJson(
				{ ...base, operation: 'getLeadsStarted', startDate: '2026-11-05', endDate: '2026-11-01' },
				() => {
					throw new Error('não devia chamar a RD');
				},
			),
			(erro) => {
				assert.equal(erro.message, "The 'End Date' is before the 'Start Date' [item 0]");
				return true;
			},
		);
	});

	it('C48 - o loadOptions de ações lê o fluxo e devolve { name: type, value: id }', async () => {
		const {
			RdStationMarketing,
		} = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
		const ctx = contexto({ workflowId: 'wf-1' }, () => ({
			workflow_info: {
				actions: [
					{ id: 9, type: 'SDEMA' },
					{ id: 10, type: 'WTDEL' },
				],
			},
		}));
		const opcoes = await new RdStationMarketing().methods.loadOptions.getWorkflowActions.call(ctx);
		assert.equal(ctx.requisicoes[0].url, '/platform/workflows/wf-1');
		assert.deepEqual(opcoes, [
			{ name: 'SDEMA', value: '9' },
			{ name: 'WTDEL', value: '10' },
		]);
	});
});

describe('Listas do editor', () => {
	it('C93 - o listSearch com 401 da RD lança NodeApiError com a mensagem do plano', async () => {
		const {
			RdStationMarketing,
		} = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
		const ctx = contexto({}, () => {
			throw erroHttp(401, {
				errors: { error_type: 'UNAUTHORIZED', error_message: 'Invalid token.' },
			});
		});
		// Cobre as listas de todos os recursos: elas passam pelo mesmo transporte.
		for (const nome of [
			'searchSegmentations',
			'searchWorkflows',
			'searchEmails',
			'searchCampaigns',
			'searchCustomFields',
		]) {
			await assert.rejects(
				new RdStationMarketing().methods.listSearch[nome].call(ctx, 'x'),
				(erro) => {
					assert.equal(erro.name, 'NodeApiError', nome);
					assert.match(erro.message, /Your RD Station access token is invalid or expired/, nome);
					return true;
				},
				nome,
			);
		}
	});
});
