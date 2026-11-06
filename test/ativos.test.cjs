/**
 * Testes dos ativos de marketing e das campanhas (checks C49 a C55): e-mails, landing pages,
 * pop-ups, formulários e campanhas. Todos são leitura; o que muda a saída é o envelope de cada
 * rota, o tamanho de página e o aviso de plano quando a RD recusa as campanhas.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { contexto, erroHttp, executarJson } = require('./contexto.cjs');

describe('E-mails, páginas e formulários', () => {
	it('C49 - Email Get Many envia query e devolve 1 item por elemento de items', async () => {
		const { json, requisicoes } = await executarJson(
			{ resource: 'email', operation: 'getMany', returnAll: true, search: 'boas-vindas' },
			() => ({ items: [{ id: 1 }, { id: 2 }], total: 2 }),
		);
		assert.equal(requisicoes[0].url, '/platform/emails');
		assert.equal(requisicoes[0].qs.query, 'boas-vindas');
		assert.equal(json.length, 2);
	});

	it('C50 - Email Get chama GET /platform/emails/<id>', async () => {
		const { json, requisicoes } = await executarJson(
			{ resource: 'email', operation: 'get', emailId: '55' },
			() => ({ id: 55, name: 'Boas-vindas' }),
		);
		assert.equal(requisicoes[0].url, '/platform/emails/55');
		assert.deepEqual(json, [{ id: 55, name: 'Boas-vindas' }]);
	});

	it('C51 - Landing Page, Pop-up e Form Get Many chamam as 3 rotas com page e page_size', async () => {
		const rotas = [
			['landingPage', '/platform/landing_pages'],
			['popup', '/platform/popups'],
			['form', '/platform/embeddables'],
		];
		for (const [resource, rota] of rotas) {
			// A RD não documenta o envelope destas listas: aceita array na raiz.
			const { json, requisicoes } = await executarJson(
				{ resource, operation: 'getMany', returnAll: false, limit: 10 },
				() => [{ id: 1 }, { id: 2 }],
			);
			assert.equal(requisicoes[0].url, rota, resource);
			assert.equal(requisicoes[0].qs.page, 1, resource);
			assert.equal(requisicoes[0].qs.page_size, 10, resource);
			assert.equal(json.length, 2, resource);
		}
	});
});

describe('Campaign', () => {
	const campanhas = (n, de = 0) => ({
		campaigns: Array.from({ length: n }, (_, k) => ({ id: de + k, name: `C${de + k}` })),
	});

	it('C52 - Get Many com Return All usa page_size 50 e pagina até vir menos de 50', async () => {
		const { json, requisicoes } = await executarJson(
			{ resource: 'campaign', operation: 'getMany', returnAll: true },
			(_o, n) => (n === 1 ? campanhas(50) : campanhas(7, 50)),
		);
		assert.equal(requisicoes.length, 2);
		assert.equal(requisicoes[0].qs.page_size, 50);
		assert.equal(json.length, 57);
	});

	it('C53 - Get e Get Items chamam /campaigns/<id> e /items e desembrulham a resposta', async () => {
		const unica = await executarJson(
			{ resource: 'campaign', operation: 'get', campaignId: '9' },
			() => ({ campaign: { id: 9, name: 'Black Friday' } }),
		);
		assert.equal(unica.requisicoes[0].url, '/platform/campaigns/9');
		assert.deepEqual(unica.json, [{ id: 9, name: 'Black Friday' }]);

		const itens = await executarJson(
			{ resource: 'campaign', operation: 'getItems', campaignId: '9', itemType: '', returnAll: false, limit: 10 },
			() => ({ items: [{ platform_item_id: 1 }, { platform_item_id: 2 }] }),
		);
		assert.equal(itens.requisicoes[0].url, '/platform/campaigns/9/items');
		assert.equal(itens.json.length, 2);
		assert.equal('item_type' in itens.requisicoes[0].qs, false);
	});

	it('C54 - Get Items com itemType email envia item_type=email', async () => {
		const { requisicoes } = await executarJson(
			{ resource: 'campaign', operation: 'getItems', campaignId: '9', itemType: 'email', returnAll: false, limit: 10 },
			() => ({ items: [] }),
		);
		assert.equal(requisicoes[0].qs.item_type, 'email');
	});

	it('C55 - 403 ou 404 em Get Many leva a descrição sobre os planos Pro e Advanced', async () => {
		for (const status of [403, 404]) {
			await assert.rejects(
				executarJson({ resource: 'campaign', operation: 'getMany', returnAll: true }, () => {
					throw erroHttp(status, { errors: { error_type: 'FORBIDDEN' } });
				}),
				(erro) => {
					assert.equal(
						erro.description,
						'This feature may need the Pro or Advanced plan of RD Station Marketing',
					);
					return true;
				},
				`status ${status}`,
			);
		}
	});
});

// Mantém o import de `contexto` em uso por futuros testes de listSearch destes recursos.
void contexto;
