/**
 * Testes do recurso Funnel (checks C36 a C39): ler e mudar estágio, oportunidade e dono do contato
 * no funil padrão. O ponto sensível é o `null` de `contact_owner_email`, que desassocia o dono:
 * enviar vazio por engano apagaria o responsável do contato.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { executarJson } = require('./contexto.cjs');

const base = { resource: 'funnel', identifierType: 'email', identifier: 'foo@bar.com' };
const funil = {
	lifecycle_stage: 'Lead',
	opportunity: false,
	contact_owner_email: 'dono@example.com',
	fit: 10,
	interest: 20,
};

describe('Funnel', () => {
	it('C36 - Get chama GET .../funnels/default e devolve os 5 campos', async () => {
		const { json, requisicoes } = await executarJson({ ...base, operation: 'get' }, () => funil);
		assert.equal(requisicoes[0].method, 'GET');
		assert.equal(requisicoes[0].url, '/platform/contacts/email:foo@bar.com/funnels/default');
		assert.deepEqual(Object.keys(json[0]).sort(), [
			'contact_owner_email',
			'fit',
			'interest',
			'lifecycle_stage',
			'opportunity',
		]);
	});

	it('C37 - Update envia { lifecycle_stage, opportunity } por PUT', async () => {
		const { requisicoes } = await executarJson(
			{
				...base,
				operation: 'update',
				updateFields: { lifecycleStage: 'Qualified Lead', opportunity: true },
			},
			() => funil,
		);
		assert.equal(requisicoes[0].method, 'PUT');
		assert.equal(requisicoes[0].url, '/platform/contacts/email:foo@bar.com/funnels/default');
		assert.deepEqual(requisicoes[0].body, { lifecycle_stage: 'Qualified Lead', opportunity: true });
	});

	it('C38 - o dropdown lifecycleStage tem exatamente Lead, Qualified Lead e Client', () => {
		const { RdStationMarketing } = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
		const colecao = new RdStationMarketing().description.properties.find(
			(p) => p.name === 'updateFields' && p.displayOptions?.show?.resource?.includes('funnel'),
		);
		const estagio = colecao.options.find((o) => o.name === 'lifecycleStage');
		// O check fala do conjunto exato de valores; a ordem na tela segue o lint do n8n (alfabética).
		assert.deepEqual(
			estagio.options.map((o) => o.value).sort(),
			['Client', 'Lead', 'Qualified Lead'],
		);
	});

	it('C39 - removeContactOwner envia contact_owner_email null; desligado e vazio omite o campo', async () => {
		const remover = await executarJson(
			{ ...base, operation: 'update', updateFields: { removeContactOwner: true } },
			() => funil,
		);
		assert.equal('contact_owner_email' in remover.requisicoes[0].body, true);
		assert.equal(remover.requisicoes[0].body.contact_owner_email, null);

		const omitir = await executarJson(
			{
				...base,
				operation: 'update',
				updateFields: { removeContactOwner: false, contactOwnerEmail: '', opportunity: true },
			},
			() => funil,
		);
		assert.equal('contact_owner_email' in omitir.requisicoes[0].body, false);
	});
});
