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
		{ estatico: { webhookUuid: 'w-1', webhookUuids: { [URL]: 'w-1' } }, ...extras },
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

	it('C97 - identificadores diferentes recriam e a ordem não importa; webhook de URL diferente nunca é apagado', async () => {
		const outrosIds = await rodar({ ...salvo, event_identifiers: ['newsletter'] });
		assert.equal(outrosIds.existe, false);
		assert.equal(outrosIds.ctx.requisicoes.filter((r) => r.method === 'DELETE').length, 1);
		// Igual mudando só a ordem dos identificadores: nada a recriar, nada a apagar.
		const mesmo = await rodar(salvo);
		assert.equal(mesmo.existe, true);
		assert.equal(
			mesmo.ctx.requisicoes.some((r) => r.method === 'DELETE'),
			false,
		);
		assert.equal(mesmo.ctx.estatico.webhookUuid, 'w-1');
		// URL diferente é de outro modo ou de outro workflow: o node não o enxerga como dele.
		const outraUrl = await rodar({ ...salvo, url: 'https://n8n.example.com/webhook/velha' });
		assert.equal(outraUrl.existe, false);
		assert.equal(
			outraUrl.ctx.requisicoes.some((r) => r.method === 'DELETE'),
			false,
		);
	});

	it('C98 - falha ao apagar o antigo é registrada no log e o checkExists ainda devolve false', async () => {
		const { ctx, existe } = await rodar(
			{ ...salvo, event_type: 'WEBHOOK.MARKED_OPPORTUNITY' },
			{},
			() => {
				throw erroHttp(500, { errors: { error_message: 'erro' } });
			},
		);
		assert.equal(existe, false);
		assert.equal(ctx.avisos.length, 1);
		assert.match(ctx.avisos[0], /w-1/);
		// O uuid velho sai do static data mesmo assim: o `create` grava o novo.
		assert.equal('webhookUuid' in ctx.estatico, false);
	});

	it('C102 - Include Relations diferente recria; relações ausentes na lista da RD não forçam recriação', async () => {
		// Node sem relações, mas o webhook salvo na RD tem COMPANY: a configuração mudou, recria.
		const comRelacao = await rodar({ ...salvo, include_relations: ['COMPANY'] });
		assert.equal(comRelacao.existe, false);

		// Node com relações e a lista da RD sem o campo: a RD pode não devolvê-lo na listagem, então
		// não dá para provar diferença e o webhook fica (evita recriar a cada ativação).
		const ctx = contexto(
			{ ...parametros, includeRelations: ['COMPANY', 'CONTACT_FUNNEL'] },
			() => ({ webhooks: [salvo] }),
			{ estatico: { webhookUuid: 'w-1', webhookUuids: { [URL]: 'w-1' } } },
		);
		assert.equal(await metodos().checkExists.call(ctx), true);

		// Mesmas relações em outra ordem: igual.
		const igual = contexto(
			{ ...parametros, includeRelations: ['COMPANY', 'CONTACT_FUNNEL'] },
			() => ({ webhooks: [{ ...salvo, include_relations: ['CONTACT_FUNNEL', 'COMPANY'] }] }),
			{ estatico: { webhookUuid: 'w-1', webhookUuids: { [URL]: 'w-1' } } },
		);
		assert.equal(await metodos().checkExists.call(igual), true);
	});

	it('C103 - modo de teste: webhook de produção com outra URL não é apagado nem alterado', async () => {
		const producao = { ...salvo, url: 'https://n8n.example.com/webhook/PRODUCAO' };
		const ctx = contexto(
			parametros,
			() => ({ webhooks: [producao] }),
			// O static data guarda o uuid de produção; o node roda agora com a URL de teste.
			{
				estatico: { webhookUuid: 'w-1', webhookUuids: { [URL]: 'w-1' } },
				urlWebhook: 'https://n8n.example.com/webhook-test/abc',
			},
		);
		assert.equal(await metodos().checkExists.call(ctx), false);
		assert.equal(
			ctx.requisicoes.some((r) => r.method !== 'GET'),
			false,
		);
		// O uuid de produção continua guardado para a desativação real apagar o webhook certo.
		assert.equal(ctx.estatico.webhookUuid, 'w-1');
	});

	it('C104 - achou pela URL deste modo com a mesma configuração: guarda o uuid e devolve true', async () => {
		// Static data vazio (por exemplo depois de um reinício), mas o webhook deste modo já existe na RD.
		const ctx = contexto(parametros, () => ({ webhooks: [salvo] }), { estatico: {} });
		assert.equal(await metodos().checkExists.call(ctx), true);
		assert.equal(ctx.estatico.webhookUuid, 'w-1');
		assert.deepEqual(ctx.estatico.webhookUuids, { [URL]: 'w-1' });
		assert.equal(
			ctx.requisicoes.some((r) => r.method !== 'GET'),
			false,
		);
	});

	it('C105 - delete apaga só o uuid guardado para a URL deste modo', async () => {
		const teste = 'https://n8n.example.com/webhook-test/abc';
		const mapa = { [URL]: 'w-prod', [teste]: 'w-teste' };
		// Desativar no modo de teste: apaga só o webhook de teste, e o de produção continua guardado.
		const emTeste = contexto({}, () => undefined, {
			estatico: { webhookUuids: { ...mapa }, webhookUuid: 'w-prod' },
			urlWebhook: teste,
		});
		assert.equal(await metodos().delete.call(emTeste), true);
		assert.deepEqual(
			emTeste.requisicoes.map((r) => `${r.method} ${r.url}`),
			['DELETE /integrations/webhooks/w-teste'],
		);
		assert.deepEqual(emTeste.estatico.webhookUuids, { [URL]: 'w-prod' });
		assert.equal(emTeste.estatico.webhookUuid, 'w-prod');
		// Sem uuid guardado para esta URL, nada é apagado e o delete termina com sucesso.
		const semUuid = contexto({}, () => undefined, {
			estatico: { webhookUuids: { [URL]: 'w-prod' } },
			urlWebhook: teste,
		});
		assert.equal(await metodos().delete.call(semUuid), true);
		assert.equal(semUuid.requisicoes.length, 0);
	});

	it('C106 - duas entradas com a mesma URL: mantém a que bate, apaga as outras e guarda a que ficou', async () => {
		const ctx = contexto(
			parametros,
			() => ({
				webhooks: [
					{ ...salvo, uuid: 'a1', event_type: 'WEBHOOK.MARKED_OPPORTUNITY' },
					{ ...salvo, uuid: 'a2' },
				],
			}),
			{ estatico: {} },
		);
		assert.equal(await metodos().checkExists.call(ctx), true);
		assert.deepEqual(
			ctx.requisicoes.filter((r) => r.method === 'DELETE').map((r) => r.url),
			['/integrations/webhooks/a1'],
		);
		assert.deepEqual(ctx.estatico.webhookUuids, { [URL]: 'a2' });

		// Nenhuma bate: apaga as duas e devolve false para o n8n criar uma nova.
		const nenhuma = contexto(
			parametros,
			() => ({
				webhooks: [
					{ ...salvo, uuid: 'b1', event_type: 'WEBHOOK.MARKED_OPPORTUNITY' },
					{ ...salvo, uuid: 'b2', event_identifiers: ['x'] },
				],
			}),
			{ estatico: {} },
		);
		assert.equal(await metodos().checkExists.call(nenhuma), false);
		assert.deepEqual(
			nenhuma.requisicoes.filter((r) => r.method === 'DELETE').map((r) => r.url),
			['/integrations/webhooks/b1', '/integrations/webhooks/b2'],
		);
	});

	it('C107 - static data sem o mapa por URL nunca faz o delete apagar um webhook', async () => {
		// Só existe o webhookUuid antigo, sem saber de qual URL ele é: apagar poderia atingir produção.
		const emTeste = contexto({}, () => undefined, {
			estatico: { webhookUuid: 'p1' },
			urlWebhook: 'https://n8n.example.com/webhook-test/abc',
		});
		assert.equal(await metodos().delete.call(emTeste), true);
		assert.equal(emTeste.requisicoes.length, 0);
		assert.equal(emTeste.estatico.webhookUuid, 'p1');
	});

	it('C108 - webhook da lista sem uuid é ignorado e nada "undefined" vai para o static data', async () => {
		const ctx = contexto(parametros, () => ({ webhooks: [{ ...salvo, uuid: undefined }] }), {
			estatico: {},
		});
		assert.equal(await metodos().checkExists.call(ctx), false);
		assert.equal(JSON.stringify(ctx.estatico).includes('undefined'), false);
		assert.equal(
			ctx.requisicoes.some((r) => r.method !== 'GET'),
			false,
		);
	});

	it('C109 - sem webhook da URL na RD, o checkExists esquece o uuid guardado para essa URL', async () => {
		// Alguém apagou o webhook na RD: o mapa não pode seguir apontando para um uuid que não existe.
		const ctx = contexto(
			parametros,
			() => ({ webhooks: [{ ...salvo, url: 'https://outra.example.com/x' }] }),
			{
				estatico: {
					webhookUuids: { [URL]: 'w-1', 'https://outra.example.com/x': 'w-9' },
					webhookUuid: 'w-1',
				},
			},
		);
		assert.equal(await metodos().checkExists.call(ctx), false);
		assert.deepEqual(ctx.estatico.webhookUuids, { 'https://outra.example.com/x': 'w-9' });
		assert.equal(ctx.estatico.webhookUuid, 'w-9');
		assert.equal(
			ctx.requisicoes.some((r) => r.method !== 'GET'),
			false,
		);
	});

	it('C106 - duas entradas que batem: fica a primeira, sai a segunda; sem correspondência o mapa fica vazio', async () => {
		const ctx = contexto(
			parametros,
			() => ({
				webhooks: [
					{ ...salvo, uuid: 'c1' },
					{ ...salvo, uuid: 'c2' },
				],
			}),
			{ estatico: {} },
		);
		assert.equal(await metodos().checkExists.call(ctx), true);
		assert.deepEqual(
			ctx.requisicoes.filter((r) => r.method === 'DELETE').map((r) => r.url),
			['/integrations/webhooks/c2'],
		);
		assert.deepEqual(ctx.estatico.webhookUuids, { [URL]: 'c1' });

		const nenhuma = contexto(
			parametros,
			() => ({ webhooks: [{ ...salvo, uuid: 'd1', event_type: 'WEBHOOK.MARKED_OPPORTUNITY' }] }),
			{ estatico: {} },
		);
		assert.equal(await metodos().checkExists.call(nenhuma), false);
		assert.deepEqual(nenhuma.estatico.webhookUuids ?? {}, {});
	});
});
