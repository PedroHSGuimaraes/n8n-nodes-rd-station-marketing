/**
 * Contexto falso do n8n usado por todos os testes do pacote.
 *
 * Os testes chamam o `execute`, o `listSearch`, o `loadOptions` e os métodos do gatilho do `dist`
 * com este contexto, que grava cada requisição HTTP em vez de sair para a rede. Assim a regra
 * testada (rota, query, corpo, erro) é a mesma que roda dentro do n8n, sem chamar a RD de verdade.
 * O arquivo não termina em `.test.cjs`, então o `node --test` não o executa como suíte.
 */

// Erro que imita o que o n8n lança quando a RD responde fora de 2xx: o NodeApiError traz o status
// em `httpCode` e a resposta original da RD em `cause.response`.
function erroHttp(status, corpo) {
	const erro = new Error(`Request failed with status code ${status}`);
	erro.httpCode = String(status);
	erro.cause = { response: { status, data: corpo } };
	return erro;
}

/**
 * Monta um contexto de execução.
 *
 * @param parametros valores dos parâmetros do node; um objeto vale para todos os itens e uma lista
 *   de objetos dá um conjunto por item (índice do item = índice da lista).
 * @param responder função chamada a cada requisição com `(opcoes, numeroDaChamada)`; devolve o
 *   corpo da resposta ou lança (use `erroHttp`) para simular erro da RD.
 * @param extras opções do contexto: `itens` (entrada), `continuarEmErro`, `estatico`
 *   (static data do workflow), `urlWebhook`, `corpoWebhook`.
 */
function contexto(parametros, responder, extras = {}) {
	const requisicoes = [];
	const estatico = extras.estatico || {};
	const itens = extras.itens || [{ json: {} }];
	const doItem = (i) => (Array.isArray(parametros) ? parametros[i] || {} : parametros);
	const ctx = {
		requisicoes,
		estatico,
		getNode: () => ({ name: 'RD Station Marketing', type: 'rdStationMarketing', typeVersion: 1 }),
		getInputData: () => itens,
		continueOnFail: () => Boolean(extras.continuarEmErro),
		getNodeParameter: (nome, i, padrao) => {
			const valores = doItem(i);
			return Object.prototype.hasOwnProperty.call(valores, nome) ? valores[nome] : padrao;
		},
		// Usado pelo `loadOptions`, que lê o que a pessoa já preencheu na tela (ex.: o fluxo escolhido).
		getCurrentNodeParameter: (nome) => doItem(0)[nome],
		getWorkflowStaticData: () => estatico,
		getNodeWebhookUrl: () => extras.urlWebhook || 'https://n8n.example.com/webhook/abc',
		getBodyData: () => extras.corpoWebhook || {},
		helpers: {
			httpRequestWithAuthentication: async (tipoCredencial, opcoes) => {
				requisicoes.push({ tipoCredencial, ...opcoes });
				return responder ? responder(opcoes, requisicoes.length) : {};
			},
			returnJsonArray: (dados) => (Array.isArray(dados) ? dados : [dados]).map((json) => ({ json })),
			constructExecutionMetaData: (dados, { itemData }) =>
				dados.map((d) => ({ ...d, pairedItem: itemData })),
		},
	};
	return ctx;
}

// Roda o `execute` do node de ação com os parâmetros dados e devolve saída e requisições.
async function executar(parametros, responder, extras = {}) {
	const { RdStationMarketing } = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
	const ctx = contexto(parametros, responder, extras);
	const saida = await new RdStationMarketing().execute.call(ctx);
	return { saida: saida[0], requisicoes: ctx.requisicoes, ctx };
}

// Atalho: lista só os `json` da saída, que é o que a maioria dos testes compara.
async function executarJson(parametros, responder, extras = {}) {
	const r = await executar(parametros, responder, extras);
	return { ...r, json: r.saida.map((item) => item.json) };
}

module.exports = { contexto, erroHttp, executar, executarJson };
