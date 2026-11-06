/**
 * Testes dos recursos Product Catalog e Webhook do node de ação (checks C75 a C81).
 *
 * O catálogo tem um formato fechado de três valores e credenciais opcionais que não podem ir
 * vazias. O recurso Webhook só aceita os dois eventos do Marketing: os eventos `crm_deal_*` que a
 * mesma rota da RD aceita pertencem ao pacote do CRM e não podem aparecer aqui.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { executarJson } = require('./contexto.cjs');

const propriedade = (nome, recurso) => {
	const { RdStationMarketing } = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
	return new RdStationMarketing().description.properties.find(
		(p) => p.name === nome && p.displayOptions?.show?.resource?.includes(recurso),
	);
};

describe('Product Catalog', () => {
	it('C75 - Create envia name, url e format e omite username e password vazios', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'productCatalog',
				operation: 'create',
				name: 'Loja',
				url: 'https://example.com/feed.json',
				format: 'json',
				additionalFields: { username: '', password: '' },
			},
			() => ({ id: 1 }),
		);
		assert.equal(requisicoes[0].method, 'POST');
		assert.equal(requisicoes[0].url, '/platform/catalog_feeds');
		assert.deepEqual(requisicoes[0].body, {
			name: 'Loja',
			url: 'https://example.com/feed.json',
			format: 'json',
		});
	});

	it('C76 - Get, Get Many, Update e Delete chamam GET, GET, PATCH e DELETE', async () => {
		const get = await executarJson(
			{ resource: 'productCatalog', operation: 'get', catalogId: '7' },
			() => ({ id: 7 }),
		);
		assert.equal(get.requisicoes[0].method, 'GET');
		assert.equal(get.requisicoes[0].url, '/platform/catalog_feeds/7');

		// A lista chega como array na raiz.
		const lista = await executarJson(
			{ resource: 'productCatalog', operation: 'getMany', returnAll: true },
			() => [{ id: 7 }, { id: 8 }],
		);
		assert.equal(lista.requisicoes[0].url, '/platform/catalog_feeds');
		assert.equal(lista.json.length, 2);

		const update = await executarJson(
			{
				resource: 'productCatalog',
				operation: 'update',
				catalogId: '7',
				name: 'Loja nova',
				url: 'https://example.com/novo.xml',
				format: 'xml',
			},
			() => ({ id: 7 }),
		);
		assert.equal(update.requisicoes[0].method, 'PATCH');
		assert.equal(update.requisicoes[0].url, '/platform/catalog_feeds/7');

		const apagar = await executarJson(
			{ resource: 'productCatalog', operation: 'delete', catalogId: '7' },
			() => undefined,
		);
		assert.equal(apagar.requisicoes[0].method, 'DELETE');
		assert.deepEqual(apagar.json, [{ deleted: true }]);
	});

	it('C77 - o dropdown format tem exatamente xml, json e google_shopping', () => {
		const formato = propriedade('format', 'productCatalog');
		assert.deepEqual(formato.options.map((o) => o.value).sort(), ['google_shopping', 'json', 'xml']);
	});
});

describe('Webhook (node de ação)', () => {
	const base = { resource: 'webhook', url: 'https://n8n.example.com/webhook/abc' };

	it('C78 - Create envia CONTACT, POST e event_identifiers ["newsletter"]', async () => {
		const { requisicoes } = await executarJson(
			{
				...base,
				operation: 'create',
				eventType: 'WEBHOOK.CONVERTED',
				eventIdentifiers: 'newsletter',
			},
			() => ({ uuid: 'w-1' }),
		);
		assert.equal(requisicoes[0].method, 'POST');
		assert.equal(requisicoes[0].url, '/integrations/webhooks');
		assert.deepEqual(requisicoes[0].body, {
			event_type: 'WEBHOOK.CONVERTED',
			entity_type: 'CONTACT',
			url: 'https://n8n.example.com/webhook/abc',
			http_method: 'POST',
			event_identifiers: ['newsletter'],
		});
	});

	it('C79 - com MARKED_OPPORTUNITY eventIdentifiers fica escondido e o corpo omite event_identifiers', async () => {
		const campo = propriedade('eventIdentifiers', 'webhook');
		assert.deepEqual(campo.displayOptions.show.eventType, ['WEBHOOK.CONVERTED']);
		const { requisicoes } = await executarJson(
			{
				...base,
				operation: 'create',
				eventType: 'WEBHOOK.MARKED_OPPORTUNITY',
				eventIdentifiers: 'newsletter',
			},
			() => ({ uuid: 'w-2' }),
		);
		assert.equal('event_identifiers' in requisicoes[0].body, false);
	});

	it('C80 - Get, Get Many, Update e Delete chamam GET, GET, PUT e DELETE', async () => {
		const get = await executarJson(
			{ resource: 'webhook', operation: 'get', webhookId: 'w-1' },
			() => ({ uuid: 'w-1' }),
		);
		assert.equal(get.requisicoes[0].url, '/integrations/webhooks/w-1');

		const lista = await executarJson(
			{ resource: 'webhook', operation: 'getMany', returnAll: true },
			() => ({ webhooks: [{ uuid: 'w-1' }, { uuid: 'w-2' }] }),
		);
		assert.equal(lista.requisicoes[0].url, '/integrations/webhooks');
		assert.equal(lista.json.length, 2);

		const update = await executarJson(
			{ ...base, operation: 'update', webhookId: 'w-1', eventType: 'WEBHOOK.CONVERTED', eventIdentifiers: '' },
			() => ({ uuid: 'w-1' }),
		);
		assert.equal(update.requisicoes[0].method, 'PUT');
		assert.equal(update.requisicoes[0].url, '/integrations/webhooks/w-1');
		// O PUT da RD é completo: leva também a entidade e o método.
		assert.equal(update.requisicoes[0].body.entity_type, 'CONTACT');

		const apagar = await executarJson(
			{ resource: 'webhook', operation: 'delete', webhookId: 'w-1' },
			() => undefined,
		);
		assert.equal(apagar.requisicoes[0].method, 'DELETE');
		assert.deepEqual(apagar.json, [{ deleted: true }]);
	});

	it('C81 - o dropdown eventType tem só os 2 eventos do Marketing e nenhum crm_deal_*', () => {
		const tipo = propriedade('eventType', 'webhook');
		assert.deepEqual(tipo.options.map((o) => o.value).sort(), [
			'WEBHOOK.CONVERTED',
			'WEBHOOK.MARKED_OPPORTUNITY',
		]);
	});
});
