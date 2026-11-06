/**
 * Testes do recurso Contact (checks C18 a C28) e do transporte comum (C11, C14 a C17).
 *
 * Cada teste abre o nome com o id do check, porque a linha de prova do checks.md procura
 * `✔ C18 -` na saída do reporter. Os testes chamam o `execute` do `dist` com o contexto falso de
 * `contexto.cjs`, então uma regressão na rota, no corpo ou na mensagem de erro faz o teste falhar.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { erroHttp, executarJson } = require('./contexto.cjs');

const base = { resource: 'contact', identifierType: 'email', identifier: 'foo@bar.com' };

describe('Contact', () => {
	it('C18 - Get chama GET /platform/contacts/email:foo@bar.com e devolve 1 item', async () => {
		const resposta = { uuid: 'u-1', name: 'Foo', email: 'foo@bar.com', extra: 'x' };
		const { json, requisicoes } = await executarJson({ ...base, operation: 'get' }, () => resposta);
		assert.equal(requisicoes.length, 1);
		assert.equal(requisicoes[0].method, 'GET');
		assert.equal(requisicoes[0].url, '/platform/contacts/email:foo@bar.com');
		assert.deepEqual(json, [resposta]);
	});

	it('C19 - Create envia { email, name } em POST /platform/contacts', async () => {
		const { requisicoes } = await executarJson(
			{ resource: 'contact', operation: 'create', email: 'ana@example.com', name: 'Ana' },
			() => ({ uuid: 'u-2' }),
		);
		assert.equal(requisicoes[0].method, 'POST');
		assert.equal(requisicoes[0].url, '/platform/contacts');
		assert.deepEqual(requisicoes[0].body, { email: 'ana@example.com', name: 'Ana' });
	});

	it('C20 - Create sem e-mail e sem telefone lança o erro do plano sem chamar a RD', async () => {
		await assert.rejects(
			executarJson({ resource: 'contact', operation: 'create', email: '', name: 'Ana' }, () => {
				throw new Error('não devia chamar a RD');
			}),
			(erro) => {
				assert.equal(erro.message, 'Provide an email or a phone [item 0]');
				assert.equal(erro.description, 'The contact needs at least one of them to be created');
				return true;
			},
		);
	});

	it('C21 - Update por e-mail não envia email; por uuid envia o email novo', async () => {
		const campos = { email: 'novo@example.com', name: 'Novo' };
		const porEmail = await executarJson(
			{ ...base, operation: 'update', updateFields: campos },
			() => ({}),
		);
		assert.equal(porEmail.requisicoes[0].method, 'PATCH');
		assert.equal(porEmail.requisicoes[0].url, '/platform/contacts/email:foo@bar.com');
		assert.deepEqual(porEmail.requisicoes[0].body, { name: 'Novo' });

		const porUuid = await executarJson(
			{ resource: 'contact', operation: 'update', identifierType: 'uuid', identifier: 'u-9', updateFields: campos },
			() => ({}),
		);
		assert.equal(porUuid.requisicoes[0].url, '/platform/contacts/uuid:u-9');
		assert.deepEqual(porUuid.requisicoes[0].body, { email: 'novo@example.com', name: 'Novo' });
	});

	it('C22 - Update com tags "a, b" envia ["a","b"] e a descrição avisa que substitui', async () => {
		const { requisicoes } = await executarJson(
			{ ...base, operation: 'update', updateFields: { tags: 'a, b' } },
			() => ({}),
		);
		assert.deepEqual(requisicoes[0].body.tags, ['a', 'b']);

		const { RdStationMarketing } = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
		const propriedades = new RdStationMarketing().description.properties;
		const atualizar = propriedades.find(
			(p) => p.name === 'updateFields' && p.displayOptions?.show?.resource?.includes('contact'),
		);
		const tags = atualizar.options.find((o) => o.name === 'tags');
		assert.match(tags.description, /Replaces all existing tags/);
	});

	it('C23 - Delete chama DELETE e devolve { deleted: true } com 204 sem corpo', async () => {
		const { json, requisicoes } = await executarJson(
			{ ...base, operation: 'delete' },
			() => undefined,
		);
		assert.equal(requisicoes[0].method, 'DELETE');
		assert.equal(requisicoes[0].url, '/platform/contacts/email:foo@bar.com');
		assert.deepEqual(json, [{ deleted: true }]);
	});

	it('C24 - Add Tags chama POST .../tag com { tags: ["Primeiro contato"] }', async () => {
		const { requisicoes } = await executarJson(
			{ ...base, operation: 'addTags', tags: 'Primeiro contato' },
			() => ({ uuid: 'u-1' }),
		);
		assert.equal(requisicoes[0].method, 'POST');
		assert.equal(requisicoes[0].url, '/platform/contacts/email:foo@bar.com/tag');
		assert.deepEqual(requisicoes[0].body, { tags: ['Primeiro contato'] });
	});

	it('C25 - Get Events com Return All repete page 1, 2, 3 até vir uma página vazia', async () => {
		const paginas = [[{ event_type: 'CONVERSION', n: 1 }], [{ event_type: 'CONVERSION', n: 2 }], []];
		const { json, requisicoes } = await executarJson(
			{
				resource: 'contact',
				operation: 'getEvents',
				contactUuid: 'u-1',
				eventType: 'CONVERSION',
				returnAll: true,
			},
			(_opcoes, chamada) => paginas[chamada - 1],
		);
		assert.equal(requisicoes.length, 3);
		assert.equal(requisicoes[0].url, '/platform/contacts/u-1/events');
		assert.deepEqual(
			requisicoes.map((r) => r.qs.page),
			[1, 2, 3],
		);
		assert.equal(requisicoes[0].qs.event_type, 'CONVERSION');
		assert.equal(json.length, 2);
	});

	it('C26 - Custom Fields de Create e Update entram no corpo como cf_plano: "Pro"', async () => {
		const campos = { values: [{ field: 'cf_plano', value: 'Pro' }] };
		const criar = await executarJson(
			{ resource: 'contact', operation: 'create', email: 'a@b.com', name: 'A', customFields: campos },
			() => ({}),
		);
		assert.equal(criar.requisicoes[0].body.cf_plano, 'Pro');
		const atualizar = await executarJson(
			{ ...base, operation: 'update', updateFields: {}, customFields: campos },
			() => ({}),
		);
		assert.equal(atualizar.requisicoes[0].body.cf_plano, 'Pro');
	});

	it('C27 - Simplify em Get devolve só os 10 campos do plano', async () => {
		const completo = {
			uuid: 'u',
			name: 'N',
			email: 'e',
			phone: 'p',
			job_title: 'j',
			city: 'c',
			state: 's',
			country: 'br',
			tags: ['t'],
			website: 'w',
			bio: 'fora',
			links: [],
		};
		const { json } = await executarJson(
			{ ...base, operation: 'get', simplify: true },
			() => completo,
		);
		assert.deepEqual(Object.keys(json[0]).sort(), [
			'city',
			'country',
			'email',
			'job_title',
			'name',
			'phone',
			'state',
			'tags',
			'uuid',
			'website',
		]);
	});

	it('C28 - 404 em Get vira "The contact was not found [item 0]" com a descrição do plano', async () => {
		await assert.rejects(
			executarJson({ ...base, operation: 'get' }, () => {
				throw erroHttp(404, { errors: { error_type: 'RESOURCE_NOT_FOUND' } });
			}),
			(erro) => {
				assert.equal(erro.message, 'The contact was not found [item 0]');
				assert.equal(
					erro.description,
					'Check the identifier type and the value, then run the node again',
				);
				return true;
			},
		);
	});
});

describe('Transporte comum', () => {
	it('C11 - toda requisição leva timeout 30000, base da RD e Content-Type JSON', async () => {
		const { requisicoes } = await executarJson({ ...base, operation: 'get' }, () => ({}));
		assert.equal(requisicoes[0].timeout, 30000);
		assert.equal(requisicoes[0].baseURL, 'https://api.rd.services');
		assert.equal(requisicoes[0].headers['Content-Type'], 'application/json');
		assert.equal(requisicoes[0].tipoCredencial, 'rdStationMarketingOAuth2Api');
	});

	it('C14 - 401 vira NodeApiError com a mensagem e a descrição do plano', async () => {
		await assert.rejects(
			executarJson({ ...base, operation: 'get' }, () => {
				throw erroHttp(401, { errors: { error_type: 'UNAUTHORIZED', error_message: 'Invalid token.' } });
			}),
			(erro) => {
				assert.equal(erro.name, 'NodeApiError');
				assert.equal(erro.message, 'Your RD Station access token is invalid or expired [item 0]');
				assert.equal(erro.description, 'Reconnect the RD Station credential and run the node again');
				return true;
			},
		);
	});

	it('C15 - 429 vira "Wait 44 seconds", "Wait 1 second" e o texto sem remaining_time', async () => {
		const falhar = (corpo) => () => {
			throw erroHttp(429, corpo);
		};
		const pegar = async (corpo) => {
			try {
				await executarJson({ ...base, operation: 'get' }, falhar(corpo));
			} catch (erro) {
				return erro;
			}
			throw new Error('devia falhar');
		};
		const longo = await pegar({ error: 'rate', max: 24, usage: 25, remaining_time: 43067 });
		assert.equal(longo.message, 'The RD Station rate limit was reached [item 0]');
		assert.equal(longo.description, 'Wait 44 seconds and run the node again');
		const curto = await pegar({ error: 'rate', remaining_time: 1000 });
		assert.equal(curto.description, 'Wait 1 second and run the node again');
		const sem = await pegar({ error: 'rate' });
		assert.equal(sem.description, 'Wait a few minutes and run the node again');
	});

	it("C16 - 400 com errors.email[0].error_type vira a mensagem do campo 'email'", async () => {
		await assert.rejects(
			executarJson({ ...base, operation: 'get' }, () => {
				throw erroHttp(400, {
					errors: { email: [{ error_type: 'CANNOT_BE_NULL', error_message: 'não pode ser nulo' }] },
				});
			}),
			(erro) => {
				assert.equal(erro.message, "RD Station rejected the 'email' field: CANNOT_BE_NULL [item 0]");
				return true;
			},
		);
	});

	it('C17 - com Continue On Fail o item 1 devolve { error } e o item 2 é processado', async () => {
		const { json, requisicoes } = await executarJson(
			[
				{ ...base, operation: 'get', identifier: 'ruim@bar.com' },
				{ ...base, operation: 'get', identifier: 'bom@bar.com' },
			],
			(opcoes) => {
				if (opcoes.url.includes('ruim')) throw erroHttp(500, { errors: { error_message: 'falha' } });
				return { uuid: 'ok' };
			},
			{ continuarEmErro: true, itens: [{ json: {} }, { json: {} }] },
		);
		assert.equal(requisicoes.length, 2);
		assert.equal(typeof json[0].error, 'string');
		assert.deepEqual(json[1], { uuid: 'ok' });
	});
});
