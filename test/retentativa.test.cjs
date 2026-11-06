/**
 * Testes da retentativa no 429 (checks C99 a C101).
 *
 * A RD limita os contatos a 120 requisições por minuto. Sem retentativa, um 429 no meio de um
 * Return All jogava fora as páginas já lidas. Os testes trocam a espera por uma função que só
 * anota o tempo pedido, para a suíte não dormir de verdade.
 */
const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { erroHttp, executarJson } = require('./contexto.cjs');
const { rdRetry } = require('../dist/nodes/RdStationMarketing/transport');

describe('Retentativa no 429', () => {
	let esperas;
	let esperaOriginal;
	beforeEach(() => {
		// Troca a espera real por uma que só registra quantos milissegundos foram pedidos.
		esperas = [];
		esperaOriginal = rdRetry.sleep;
		rdRetry.sleep = async (ms) => {
			esperas.push(ms);
		};
	});
	afterEach(() => {
		rdRetry.sleep = esperaOriginal;
	});

	const lista = {
		resource: 'segmentation',
		operation: 'getMany',
		returnAll: true,
	};
	const pagina = (inicio, quantos) => ({
		segmentations: Array.from({ length: quantos }, (_, n) => ({ id: inicio + n })),
	});

	it('C99 - 429 na página 2 e depois 200: o resultado tem as duas páginas', async () => {
		let falhou = false;
		const { json, requisicoes } = await executarJson(lista, (opcoes) => {
			if (opcoes.qs.page === 1) return pagina(1, 125);
			if (!falhou) {
				falhou = true;
				throw erroHttp(429, { error: 'rate' }, { 'retry-after': '3' });
			}
			return pagina(126, 40);
		});
		assert.equal(json.length, 165);
		// Páginas 1, 2 (429), 2 de novo (200): três requisições, e a página 2 foi repetida igual.
		assert.deepEqual(
			requisicoes.map((r) => r.qs.page),
			[1, 2, 2],
		);
		assert.equal(requisicoes[1].qs.page_size, requisicoes[2].qs.page_size);
	});

	it('C100 - a espera usa o Retry-After, depois o remaining_time e por fim um valor fixo curto', async () => {
		const casos = [
			[{ error: 'rate' }, { 'retry-after': '3' }, 3000],
			[{ error: 'rate', remaining_time: 4200 }, {}, 4200],
			[{ error: 'rate' }, {}, 2000],
			// Teto de 60 s: uma espera absurda do servidor não trava o workflow por minutos.
			[{ error: 'rate' }, { 'retry-after': '900' }, 60000],
			// Os dois juntos: o cabeçalho Retry-After ganha do remaining_time do corpo.
			[{ error: 'rate', remaining_time: 9000 }, { 'retry-after': '3' }, 3000],
			// O teto de 60 s também vale para o remaining_time do corpo.
			[{ error: 'rate', remaining_time: 120000 }, {}, 60000],
		];
		for (const [corpo, cabecalhos, esperado] of casos) {
			esperas.length = 0;
			let falhou = false;
			await executarJson(
				{ resource: 'contact', operation: 'get', identifierType: 'email', identifier: 'a@b.com' },
				() => {
					if (!falhou) {
						falhou = true;
						throw erroHttp(429, corpo, cabecalhos);
					}
					return { uuid: 'u' };
				},
			);
			assert.deepEqual(esperas, [esperado], JSON.stringify([corpo, cabecalhos]));
		}
	});

	it('C101 - depois de 3 tentativas com 429 lança o erro claro de limite, e 401 não é repetido', async () => {
		await assert.rejects(
			executarJson(
				{ resource: 'contact', operation: 'get', identifierType: 'email', identifier: 'a@b.com' },
				() => {
					throw erroHttp(429, { error: 'rate', remaining_time: 1000 });
				},
			),
			(erro) => {
				assert.equal(erro.message, 'The RD Station rate limit was reached [item 0]');
				assert.equal(erro.description, 'Wait 1 second and run the node again');
				return true;
			},
		);
		assert.equal(esperas.length, 2);

		const tentativas = [];
		await assert.rejects(
			executarJson(
				{ resource: 'contact', operation: 'get', identifierType: 'email', identifier: 'a@b.com' },
				(opcoes) => {
					tentativas.push(opcoes.url);
					throw erroHttp(401, { errors: { error_type: 'UNAUTHORIZED' } });
				},
			),
		);
		assert.equal(tentativas.length, 1);
	});

	it('C101 - exatamente 3 requisições são feitas antes de desistir', async () => {
		const tentativas = [];
		await assert.rejects(
			executarJson(
				{ resource: 'contact', operation: 'get', identifierType: 'email', identifier: 'a@b.com' },
				(opcoes) => {
					tentativas.push(opcoes.url);
					throw erroHttp(429, { error: 'rate' });
				},
			),
		);
		assert.equal(tentativas.length, 3);
	});
});
