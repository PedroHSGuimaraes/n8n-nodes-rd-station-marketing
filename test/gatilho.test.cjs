/**
 * Testes do node gatilho (checks C82 a C90): o ciclo de vida do webhook na RD (criar ao ativar,
 * conferir se já existe, apagar ao desativar) e o recebimento do corpo.
 *
 * O `uuid` guardado no static data é a única ligação entre o workflow e o webhook da RD. Se
 * `create` gravasse errado ou `delete` não limpasse, o workflow acumularia webhooks órfãos na RD
 * ou deixaria de recebê-los, e a pessoa só notaria pela falta de eventos.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { contexto, erroHttp } = require('./contexto.cjs');

const {
	RdStationMarketingTrigger,
} = require('../dist/nodes/RdStationMarketingTrigger/RdStationMarketingTrigger.node');

const metodos = () => new RdStationMarketingTrigger().webhookMethods.default;
const URL = 'https://n8n.example.com/webhook/abc';

describe('Gatilho: ativar o workflow', () => {
	it('C82 - Converted chama POST /integrations/webhooks e grava o webhookUuid no static data', async () => {
		const ctx = contexto(
			{ event: 'converted', conversionIdentifiers: '', includeRelations: [] },
			() => ({
				uuid: 'w-1',
			}),
		);
		const criado = await metodos().create.call(ctx);
		assert.equal(criado, true);
		assert.equal(ctx.requisicoes[0].method, 'POST');
		assert.equal(ctx.requisicoes[0].url, '/integrations/webhooks');
		assert.deepEqual(ctx.requisicoes[0].body, {
			event_type: 'WEBHOOK.CONVERTED',
			entity_type: 'CONTACT',
			http_method: 'POST',
			url: URL,
		});
		assert.equal(ctx.estatico.webhookUuid, 'w-1');
	});

	it('C83 - Marked as Opportunity envia WEBHOOK.MARKED_OPPORTUNITY sem event_identifiers', async () => {
		const ctx = contexto(
			{ event: 'markedOpportunity', conversionIdentifiers: 'newsletter', includeRelations: [] },
			() => ({ uuid: 'w-2' }),
		);
		await metodos().create.call(ctx);
		assert.equal(ctx.requisicoes[0].body.event_type, 'WEBHOOK.MARKED_OPPORTUNITY');
		assert.equal('event_identifiers' in ctx.requisicoes[0].body, false);
	});

	it('C84 - conversionIdentifiers "newsletter, landing-1" vira event_identifiers', async () => {
		const ctx = contexto(
			{ event: 'converted', conversionIdentifiers: 'newsletter, landing-1', includeRelations: [] },
			() => ({ uuid: 'w-3' }),
		);
		await metodos().create.call(ctx);
		assert.deepEqual(ctx.requisicoes[0].body.event_identifiers, ['newsletter', 'landing-1']);
	});

	it('C85 - includeRelations vira ["COMPANY", "CONTACT_FUNNEL"]', async () => {
		const ctx = contexto(
			{
				event: 'converted',
				conversionIdentifiers: '',
				includeRelations: ['COMPANY', 'CONTACT_FUNNEL'],
			},
			() => ({ uuid: 'w-4' }),
		);
		await metodos().create.call(ctx);
		assert.deepEqual(ctx.requisicoes[0].body.include_relations, ['COMPANY', 'CONTACT_FUNNEL']);
	});

	it('C86 - com webhookUuid ainda listado pela RD o checkExists devolve verdadeiro e nada é criado', async () => {
		const parametros = { event: 'converted', conversionIdentifiers: '', includeRelations: [] };
		const listado = contexto(parametros, () => ({
			webhooks: [
				// O webhook salvo bate com o node: mesmo evento, mesma URL e sem filtro de identificador.
				{ uuid: 'w-1', event_type: 'WEBHOOK.CONVERTED', url: URL, event_identifiers: [] },
				{ uuid: 'w-9' },
			],
		}), {
			estatico: { webhookUuid: 'w-1' },
		});
		assert.equal(await metodos().checkExists.call(listado), true);
		assert.equal(listado.requisicoes.length, 1);
		assert.equal(listado.requisicoes[0].method, 'GET');

		// Sumiu da RD (alguém apagou lá): o workflow precisa criar de novo.
		const sumido = contexto(parametros, () => ({ webhooks: [{ uuid: 'outro' }] }), {
			estatico: { webhookUuid: 'w-1' },
		});
		assert.equal(await metodos().checkExists.call(sumido), false);

		// Nunca criado: nem pergunta à RD.
		const novo = contexto(parametros, () => ({ webhooks: [] }));
		assert.equal(await metodos().checkExists.call(novo), false);
		assert.equal(novo.requisicoes.length, 0);
	});
});

describe('Gatilho: desativar o workflow', () => {
	it('C87 - delete chama DELETE e limpa o uuid; 404 conta como apagado; 500 lança NodeApiError', async () => {
		const apagado = contexto({}, () => undefined, { estatico: { webhookUuid: 'w-1' } });
		assert.equal(await metodos().delete.call(apagado), true);
		assert.equal(apagado.requisicoes[0].method, 'DELETE');
		assert.equal(apagado.requisicoes[0].url, '/integrations/webhooks/w-1');
		assert.equal('webhookUuid' in apagado.estatico, false);

		// A RD já não tem o webhook (404): objetivo cumprido, limpa o uuid.
		const jaApagado = contexto(
			{},
			() => {
				throw erroHttp(404, { errors: { error_type: 'RESOURCE_NOT_FOUND' } });
			},
			{ estatico: { webhookUuid: 'w-1' } },
		);
		assert.equal(await metodos().delete.call(jaApagado), true);
		assert.equal('webhookUuid' in jaApagado.estatico, false);

		// Erro do servidor: lança e mantém o uuid, para a próxima desativação tentar de novo.
		const falha = contexto(
			{},
			() => {
				throw erroHttp(500, { errors: { error_message: 'erro' } });
			},
			{ estatico: { webhookUuid: 'w-1' } },
		);
		await assert.rejects(metodos().delete.call(falha), (erro) => {
			assert.equal(erro.name, 'NodeApiError');
			return true;
		});
		assert.equal(falha.estatico.webhookUuid, 'w-1');
	});

	it('C88 - INVALID_URL na criação lança NodeApiError com a descrição sobre HTTPS público', async () => {
		const ctx = contexto(
			{ event: 'converted', conversionIdentifiers: '', includeRelations: [] },
			() => {
				throw erroHttp(400, {
					errors: { error_type: 'INVALID_URL', error_message: 'invalid url' },
				});
			},
		);
		await assert.rejects(metodos().create.call(ctx), (erro) => {
			assert.equal(erro.name, 'NodeApiError');
			assert.equal(
				erro.description,
				'RD Station only accepts public HTTPS URLs that answer with a 2xx status',
			);
			return true;
		});
	});
});

describe('Gatilho: receber o webhook', () => {
	it('C89 - responde 200 e emite 1 item com o corpo completo de WEBHOOK.CONVERTED', async () => {
		const corpo = {
			event_type: 'WEBHOOK.CONVERTED',
			event_identifier: 'newsletter',
			event_timestamp: '2026-11-06T10:00:00.000-03:00',
			contact: { uuid: 'c-1', email: 'ana@example.com' },
		};
		const ctx = contexto({}, undefined, { corpoWebhook: corpo });
		const resposta = await new RdStationMarketingTrigger().webhook.call(ctx);
		assert.equal(resposta.workflowData[0].length, 1);
		assert.deepEqual(resposta.workflowData[0][0].json, corpo);
		assert.equal(resposta.workflowData[0][0].json.contact.uuid, 'c-1');
	});

	it('C90 - corpo sem event_type responde 200 e não emite item', async () => {
		const ctx = contexto({}, undefined, { corpoWebhook: { teste: true } });
		const resposta = await new RdStationMarketingTrigger().webhook.call(ctx);
		assert.equal(resposta.workflowData, undefined);
		assert.ok(resposta.webhookResponse !== undefined);
	});
});
