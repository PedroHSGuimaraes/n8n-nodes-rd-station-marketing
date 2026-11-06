/**
 * Testes de reforço pedidos pelo Verifier independente (verification.md).
 *
 * Fecham três tipos de lacuna: um defeito real (Return All desligado com `limit` maior que a
 * página repetia e perdia itens), asserções que deixavam passar um limite deslocado de um, e
 * desvios do plano (o aviso de plano Pro/Advanced só vale para Campaign Get Many; a RD não tem
 * parâmetro `search` na lista de fluxos). Cada nome abre com o id do check que o teste reforça.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { contexto, erroHttp, executarJson } = require('./contexto.cjs');
const { RdStationMarketing } = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
const { RdStationMarketingApi } = require('../dist/credentials/RdStationMarketingApi.credentials');
const {
	RdStationMarketingOAuth2Api,
} = require('../dist/credentials/RdStationMarketingOAuth2Api.credentials');

// Imita uma RD que paginou de verdade: o deslocamento é (page - 1) * page_size, então trocar o
// tamanho da página no meio da leitura repete e pula registros, como na API real.
const servidorPaginado = (total, chave) => (opcoes) => {
	const { page, page_size: tamanho } = opcoes.qs;
	const inicio = (page - 1) * tamanho;
	const itens = Array.from({ length: total }, (_, n) => ({ id: n + 1 })).slice(
		inicio,
		inicio + tamanho,
	);
	return { [chave]: itens };
};
const semChamada = () => {
	throw new Error('não devia chamar a RD');
};

describe('Paginação com limit maior que a página', () => {
	it('C40 - limit 150 em segmentações devolve 150 ids distintos e em ordem', async () => {
		const { json } = await executarJson(
			{ resource: 'segmentation', operation: 'getMany', returnAll: false, limit: 150 },
			servidorPaginado(300, 'segmentations'),
		);
		assert.equal(json.length, 150);
		assert.deepEqual(
			json.map((s) => s.id),
			Array.from({ length: 150 }, (_, n) => n + 1),
		);
	});

	it('C46 - limit 30 em Leads Started (página de 25) devolve 30 ids distintos e em ordem', async () => {
		const { json } = await executarJson(
			{
				resource: 'automationFlow',
				operation: 'getLeadsStarted',
				workflowId: 'wf-1',
				startDate: '2026-11-01',
				endDate: '2026-11-05',
				returnAll: false,
				limit: 30,
			},
			servidorPaginado(100, 'leads'),
		);
		assert.deepEqual(
			json.map((l) => l.id),
			Array.from({ length: 30 }, (_, n) => n + 1),
		);
	});

	it('C40 - limit menor que a página pede só o limite e não passa dele', async () => {
		const { json, requisicoes } = await executarJson(
			{ resource: 'segmentation', operation: 'getMany', returnAll: false, limit: 10 },
			servidorPaginado(300, 'segmentations'),
		);
		assert.equal(json.length, 10);
		assert.equal(requisicoes.length, 1);
		assert.equal(requisicoes[0].qs.page_size, 10);
	});
});

describe('Limites que o Verifier mostrou frouxos', () => {
	const mesmoDia = { startDate: '2026-11-05', endDate: '2026-11-05' };

	it('C47 - datas iguais passam e chamam a RD', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'automationFlow',
				operation: 'getLeadsStarted',
				workflowId: 'wf-1',
				...mesmoDia,
				returnAll: false,
				limit: 5,
			},
			() => ({ leads: [] }),
		);
		assert.equal(requisicoes.length, 1);
	});

	it('C60 - datas iguais passam nas 4 operações de Analytics', async () => {
		for (const operation of ['getEmails', 'getWorkflowEmails', 'getFunnel', 'getConversions']) {
			const { requisicoes } = await executarJson(
				{ resource: 'analytics', operation, ...mesmoDia },
				() => ({}),
			);
			assert.equal(requisicoes.length, 1, operation);
		}
	});

	// Monta um lote com exatamente `bytes` bytes de JSON, completando com um campo de texto.
	const loteComBytes = (bytes) => {
		const vazio = [{ event_type: 'CONVERSION', event_family: 'CDP', payload: { bio: '' } }];
		const falta = bytes - Buffer.byteLength(JSON.stringify(vazio), 'utf8');
		vazio[0].payload.bio = 'x'.repeat(falta);
		assert.equal(Buffer.byteLength(JSON.stringify(vazio), 'utf8'), bytes);
		return JSON.stringify(vazio);
	};

	it('C73 - lote de 200000 bytes passa e o de 200001 bytes falha', async () => {
		const { requisicoes } = await executarJson(
			{ resource: 'event', operation: 'sendBatch', events: loteComBytes(200000) },
			() => ({ event_batch_uuid: 'b', events: [] }),
		);
		assert.equal(requisicoes.length, 1);
		await assert.rejects(
			executarJson(
				{ resource: 'event', operation: 'sendBatch', events: loteComBytes(200001) },
				semChamada,
			),
			/The batch is larger than 0\.2 MB \[item 0\]/,
		);
	});

	it('C20 - Contact Create só com telefone chama a RD', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'contact',
				operation: 'create',
				email: '',
				name: 'Ana',
				additionalFields: { phone: '+5511987654321' },
			},
			() => ({ uuid: 'u' }),
		);
		assert.equal(requisicoes[0].body.phone, '+5511987654321');
		assert.equal('email' in requisicoes[0].body, false);
	});

	it('C62 - Send Conversion só com telefone chama a RD', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'event',
				operation: 'sendConversion',
				conversionIdentifier: 'newsletter',
				email: '',
				additionalFields: { phone: '+5511987654321' },
			},
			() => ({ event_uuid: 'e' }),
		);
		assert.equal(requisicoes[0].body.payload.phone, '+5511987654321');
	});

	it('C76 - o catálogo usa os métodos e as URLs certos em Get Many e Delete', async () => {
		const lista = await executarJson(
			{ resource: 'productCatalog', operation: 'getMany', returnAll: true },
			() => [],
		);
		assert.equal(lista.requisicoes[0].method, 'GET');
		const apagar = await executarJson(
			{ resource: 'productCatalog', operation: 'delete', catalogId: '7' },
			() => undefined,
		);
		assert.equal(apagar.requisicoes[0].url, '/platform/catalog_feeds/7');
	});

	it('C80 - o webhook usa os métodos e as URLs certos em Get, Get Many e Delete', async () => {
		const um = await executarJson(
			{ resource: 'webhook', operation: 'get', webhookId: 'w-1' },
			() => ({}),
		);
		assert.equal(um.requisicoes[0].method, 'GET');
		const lista = await executarJson(
			{ resource: 'webhook', operation: 'getMany', returnAll: true },
			() => ({ webhooks: [] }),
		);
		assert.equal(lista.requisicoes[0].method, 'GET');
		const apagar = await executarJson(
			{ resource: 'webhook', operation: 'delete', webhookId: 'w-1' },
			() => undefined,
		);
		assert.equal(apagar.requisicoes[0].url, '/integrations/webhooks/w-1');
	});

	it('C12 - o ramo da chave de API envia POST com o corpo da conversão', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'event',
				operation: 'sendConversion',
				authentication: 'apiKey',
				conversionIdentifier: 'newsletter',
				email: 'ana@example.com',
			},
			() => ({ event_uuid: 'e' }),
		);
		assert.equal(requisicoes[0].method, 'POST');
		assert.equal(requisicoes[0].body.event_type, 'CONVERSION');
		assert.equal(requisicoes[0].body.payload.conversion_identifier, 'newsletter');
	});

	it('C17 - Continue On Fail devolve a mensagem traduzida da RD no item que falhou', async () => {
		const { json } = await executarJson(
			{ resource: 'contact', operation: 'get', identifierType: 'email', identifier: 'x@y.com' },
			() => {
				throw erroHttp(401, { errors: { error_type: 'UNAUTHORIZED' } });
			},
			{ continuarEmErro: true },
		);
		assert.equal(json[0].error, 'Your RD Station access token is invalid or expired [item 0]');
	});

	it('C94 - o teste das duas credenciais usa o método esperado', () => {
		const oauth = new RdStationMarketingOAuth2Api().test.request;
		assert.ok(oauth.method === undefined || oauth.method === 'GET');
		assert.equal(new RdStationMarketingApi().test.request.method, 'POST');
	});
});

describe('Desvios do plano corrigidos', () => {
	it('C55 - Campaign Get e Get Items não trazem o aviso de plano; só o Get Many traz', async () => {
		for (const [operation, extra] of [
			['get', {}],
			['getItems', { itemType: '', returnAll: false, limit: 5 }],
		]) {
			await assert.rejects(
				executarJson({ resource: 'campaign', operation, campaignId: '9', ...extra }, () => {
					throw erroHttp(404, { errors: { error_type: 'RESOURCE_NOT_FOUND' } });
				}),
				(erro) => {
					assert.notEqual(
						erro.description,
						'This feature may need the Pro or Advanced plan of RD Station Marketing',
					);
					return true;
				},
				operation,
			);
		}
	});

	it('C42 - o listSearch de fluxos filtra aqui, porque a RD não tem search nessa rota', async () => {
		const ctx = contexto({}, () => ({
			wokflows: [
				{ id: 'a', name: 'Boas-vindas' },
				{ id: 'b', name: 'Carrinho' },
			],
		}));
		const { results } = await new RdStationMarketing().methods.listSearch.searchWorkflows.call(
			ctx,
			'carr',
		);
		assert.equal('search' in ctx.requisicoes[0].qs, false);
		assert.deepEqual(results, [{ name: 'Carrinho', value: 'b' }]);
	});
});
