/**
 * Testes do `checkExists` do gatilho quando o webhook salvo já não bate com o node (checks C96 a C98).
 *
 * Se a pessoa troca o evento, os identificadores de conversão ou a URL do gatilho e reativa o
 * workflow, o uuid guardado ainda existe na RD, mas aponta para a configuração velha. Conferir só o
 * uuid manteria o webhook errado e o workflow deixaria de receber os eventos certos sem nenhum aviso.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { contexto, erroHttp } = require('./contexto.cjs');
const {
	RdStationMarketingTrigger,
} = require('../dist/nodes/RdStationMarketingTrigger/RdStationMarketingTrigger.node');

const URL = 'https://n8n.example.com/webhook/abc';
const metodos = () => new RdStationMarketingTrigger().webhookMethods.default;
const parametros = {
	event: 'converted',
	conversionIdentifiers: 'newsletter, landing-1',
	includeRelations: [],
};
// Webhook salvo na RD que bate exatamente com os parâmetros acima.
const salvo = {
	uuid: 'w-1',
	event_type: 'WEBHOOK.CONVERTED',
	url: URL,
	event_identifiers: ['landing-1', 'newsletter'],
};

// Roda o checkExists com o webhook salvo dado e devolve o contexto, para o teste olhar as chamadas.
async function rodar(webhookNaRd, extras = {}, responderApagar) {
	const ctx = contexto(
		parametros,
		(opcoes) => {
			if (opcoes.method === 'DELETE') return responderApagar ? responderApagar() : undefined;
			return { webhooks: [webhookNaRd] };
		},
		{ estatico: { webhookUuid: 'w-1' }, ...extras },
	);
	const existe = await metodos().checkExists.call(ctx);
	return { ctx, existe };
}

describe('Gatilho: webhook salvo diferente do node', () => {
	it('C96 - webhook salvo com evento diferente: checkExists devolve false e apaga o antigo', async () => {
		const { ctx, existe } = await rodar({ ...salvo, event_type: 'WEBHOOK.MARKED_OPPORTUNITY' });
		assert.equal(existe, false);
		const apagar = ctx.requisicoes.find((r) => r.method === 'DELETE');
		assert.equal(apagar.url, '/integrations/webhooks/w-1');
		assert.equal('webhookUuid' in ctx.estatico, false);
	});

	it('C97 - URL diferente e identificadores diferentes também recriam; a ordem dos identificadores não importa', async () => {
		const outraUrl = await rodar({ ...salvo, url: 'https://n8n.example.com/webhook/velha' });
		assert.equal(outraUrl.existe, false);
		const outrosIds = await rodar({ ...salvo, event_identifiers: ['newsletter'] });
		assert.equal(outrosIds.existe, false);
		// Igual mudando só a ordem dos identificadores: nada a recriar, nada a apagar.
		const mesmo = await rodar(salvo);
		assert.equal(mesmo.existe, true);
		assert.equal(mesmo.ctx.requisicoes.some((r) => r.method === 'DELETE'), false);
		assert.equal(mesmo.ctx.estatico.webhookUuid, 'w-1');
	});

	it('C98 - falha ao apagar o antigo é registrada no log e o checkExists ainda devolve false', async () => {
		const { ctx, existe } = await rodar({ ...salvo, event_type: 'WEBHOOK.MARKED_OPPORTUNITY' }, {}, () => {
			throw erroHttp(500, { errors: { error_message: 'erro' } });
		});
		assert.equal(existe, false);
		assert.equal(ctx.avisos.length, 1);
		assert.match(ctx.avisos[0], /w-1/);
		// O uuid velho sai do static data mesmo assim: o `create` grava o novo.
		assert.equal('webhookUuid' in ctx.estatico, false);
	});
});
