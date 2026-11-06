/**
 * Testes do recurso Custom Field (checks C29 a C35).
 *
 * Os campos personalizados são a única lista da RD que vem inteira, sem paginação, e o único
 * recurso que escreve `name` e `label` em um objeto por idioma. Cada teste protege uma dessas
 * particularidades: se a rota passar a enviar `page`, ou o nome deixar de ir como `{ "pt-BR": ... }`,
 * o teste correspondente falha.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { contexto, executarJson } = require('./contexto.cjs');

const campo = (n) => ({
	uuid: `uuid-${n}`,
	api_identifier: `cf_campo${n}`,
	custom_field: true,
	name: { default: `Campo ${n}`, 'pt-BR': `Campo ${n}` },
	label: { default: `Campo ${n}`, 'pt-BR': `Campo ${n}` },
});

describe('Custom Field', () => {
	it('C29 - Get Many com Return All chama a rota uma vez, sem page, e devolve 1 item por campo', async () => {
		const { json, requisicoes } = await executarJson(
			{ resource: 'customField', operation: 'getMany', returnAll: true },
			() => ({ fields: [campo(1), campo(2), campo(3)] }),
		);
		assert.equal(requisicoes.length, 1);
		assert.equal(requisicoes[0].method, 'GET');
		assert.equal(requisicoes[0].url, '/platform/contacts/fields');
		assert.equal(requisicoes[0].qs, undefined);
		assert.equal(json.length, 3);
		assert.equal(json[0].api_identifier, 'cf_campo1');
	});

	it('C30 - Get Many com Limit 10 e 25 campos devolve 10 itens', async () => {
		const todos = Array.from({ length: 25 }, (_, n) => campo(n));
		const { json } = await executarJson(
			{ resource: 'customField', operation: 'getMany', returnAll: false, limit: 10 },
			() => ({ fields: todos }),
		);
		assert.equal(json.length, 10);
	});

	it('C31 - Create envia name e label como { "pt-BR": "Plano" }', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'customField',
				operation: 'create',
				apiIdentifier: 'cf_plano',
				dataType: 'STRING',
				name: 'Plano',
				label: 'Plano',
				presentationType: 'TEXT_INPUT',
			},
			() => campo(1),
		);
		assert.equal(requisicoes[0].method, 'POST');
		assert.equal(requisicoes[0].url, '/platform/contacts/fields');
		assert.deepEqual(requisicoes[0].body, {
			api_identifier: 'cf_plano',
			data_type: 'STRING',
			name: { 'pt-BR': 'Plano' },
			label: { 'pt-BR': 'Plano' },
			presentation_type: 'TEXT_INPUT',
		});
	});

	it("C32 - api_identifier sem cf_ lança o erro do plano sem chamar a RD", async () => {
		await assert.rejects(
			executarJson(
				{
					resource: 'customField',
					operation: 'create',
					apiIdentifier: 'plano',
					dataType: 'STRING',
					name: 'Plano',
					label: 'Plano',
					presentationType: 'TEXT_INPUT',
				},
				() => {
					throw new Error('não devia chamar a RD');
				},
			),
			(erro) => {
				assert.equal(erro.message, "The 'API Identifier' must start with 'cf_' [item 0]");
				return true;
			},
		);
	});

	it('C33 - Update chama PATCH .../fields/<uuid> sem api_identifier no corpo', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'customField',
				operation: 'update',
				customFieldId: 'uuid-7',
				apiIdentifier: 'cf_plano',
				dataType: 'STRING',
				name: 'Plano novo',
				label: 'Plano novo',
				presentationType: 'TEXT_INPUT',
			},
			() => campo(7),
		);
		assert.equal(requisicoes[0].method, 'PATCH');
		assert.equal(requisicoes[0].url, '/platform/contacts/fields/uuid-7');
		assert.equal('api_identifier' in requisicoes[0].body, false);
		assert.deepEqual(requisicoes[0].body.name, { 'pt-BR': 'Plano novo' });
	});

	it('C34 - Delete chama DELETE e devolve { deleted: true }', async () => {
		const { json, requisicoes } = await executarJson(
			{ resource: 'customField', operation: 'delete', customFieldId: 'uuid-7' },
			() => undefined,
		);
		assert.equal(requisicoes[0].method, 'DELETE');
		assert.equal(requisicoes[0].url, '/platform/contacts/fields/uuid-7');
		assert.deepEqual(json, [{ deleted: true }]);
	});

	it('C35 - o loadOptions mantém só custom_field verdadeiro e devolve { name, value: api_identifier }', async () => {
		const { RdStationMarketing } = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
		const padrao = {
			uuid: 'p-1',
			api_identifier: 'email',
			custom_field: false,
			name: { 'pt-BR': 'E-mail' },
			label: { 'pt-BR': 'E-mail' },
		};
		const ctx = contexto({}, () => ({ fields: [padrao, campo(1)] }));
		const opcoes = await new RdStationMarketing().methods.loadOptions.getCustomFieldNames.call(ctx);
		assert.deepEqual(opcoes, [{ name: 'Campo 1', value: 'cf_campo1' }]);
		assert.equal(ctx.requisicoes[0].url, '/platform/contacts/fields');
	});

	it('C35 - o listSearch de campos devolve { name, value: uuid } e filtra pela busca', async () => {
		const { RdStationMarketing } = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
		const ctx = contexto({}, () => ({ fields: [campo(1), campo(2)] }));
		const { results } = await new RdStationMarketing().methods.listSearch.searchCustomFields.call(
			ctx,
			'campo 2',
		);
		assert.deepEqual(results, [{ name: 'Campo 2 (cf_campo2)', value: 'uuid-2' }]);
	});
});
