/**
 * Transporte HTTP do RD Station Marketing.
 *
 * Reúne o que toda chamada à RD tem em comum: base da URL, cabeçalho JSON, timeout, escolha da
 * credencial, paginação e tradução dos erros da RD (401, 429, 400/422, 403/404) em mensagens
 * claras. As operações do node, o `listSearch` e o gatilho passam todos por aqui, então uma regra
 * de erro ou de timeout muda em um lugar só.
 */
import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

import { extractItems } from './helpers';

// Qualquer contexto do n8n que sabe fazer requisição autenticada: execução, listas e hooks do gatilho.
export type RdContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

export type RdAuthentication = 'oAuth2' | 'apiKey';

// Endereço único da API do Marketing; só as rotas mudam entre operações.
export const RD_BASE_URL = 'https://api.rd.services';

// A RD não documenta o p99 das rotas; 30 s evita travar o workflow sem cortar chamadas lentas legítimas.
export const RD_TIMEOUT_MS = 30000;

// Texto de erro que muda por operação: o chamador diz qual mensagem usar para um status HTTP.
export interface RdErrorHint {
	message?: string;
	description?: string;
	// Só aplica o texto quando o corpo de erro da RD contém este trecho (ex.: `INVALID_URL`).
	whenBodyIncludes?: string;
}

export interface RdRequestOptions {
	body?: IDataObject | IDataObject[];
	qs?: IDataObject;
	itemIndex?: number;
	authentication?: RdAuthentication;
	errorHints?: Record<number, RdErrorHint>;
}

// Nome da credencial de cada forma de autenticação (porta de uma via: fica salvo nos workflows).
// É uma função, e não uma tabela, porque o lint de segredos confunde a chave `oAuth2` com um segredo.
function credentialName(authentication: RdAuthentication): string {
	return authentication === 'apiKey' ? 'rdStationMarketingApi' : 'rdStationMarketingOAuth2Api';
}

// Lê um valor aninhado de um objeto desconhecido sem estourar quando um elo do caminho não existe.
function pick(source: unknown, path: string[]): unknown {
	let current: unknown = source;
	for (const key of path) {
		if (current === null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

// Extrai o status HTTP do erro que o n8n lança; cada versão guarda o número num lugar diferente.
function statusOf(error: unknown): number | undefined {
	const raw =
		pick(error, ['httpCode']) ??
		pick(error, ['statusCode']) ??
		pick(error, ['cause', 'response', 'status']) ??
		pick(error, ['response', 'status']);
	const status = Number(raw);
	return Number.isFinite(status) && status > 0 ? status : undefined;
}

// Extrai o corpo de erro que a RD enviou (`{ errors: ... }` ou `{ error, remaining_time }`).
function bodyOf(error: unknown): IDataObject {
	const raw =
		pick(error, ['cause', 'response', 'data']) ??
		pick(error, ['cause', 'response', 'body']) ??
		pick(error, ['response', 'data']) ??
		pick(error, ['context', 'data']) ??
		pick(error, ['cause', 'error']);
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw) as IDataObject;
		} catch {
			return { message: raw };
		}
	}
	return raw !== null && typeof raw === 'object' ? (raw as IDataObject) : {};
}

// Acha o primeiro erro de campo da RD (`errors.email[0].error_type`) para dizer qual campo falhou.
function firstFieldError(body: IDataObject): { field: string; type: string } | undefined {
	const errors = body.errors;
	if (errors === null || typeof errors !== 'object') return undefined;
	for (const [field, list] of Object.entries(errors as IDataObject)) {
		const first = Array.isArray(list) ? (list[0] as IDataObject | undefined) : undefined;
		if (first?.error_type) return { field, type: String(first.error_type) };
	}
	return undefined;
}

// Converte o `remaining_time` (milissegundos) em segundos inteiros para cima; sem ele, orienta por minutos.
function waitText(body: IDataObject): string {
	const remaining = Number(body.remaining_time);
	if (!Number.isFinite(remaining) || remaining <= 0)
		return 'Wait a few minutes and run the node again';
	const seconds = Math.ceil(remaining / 1000);
	return `Wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'} and run the node again`;
}

// Retentativa no 429. O objeto é exportado para o teste trocar a espera e não dormir de verdade.
export const rdRetry = {
	// Total de requisições por chamada, contando a primeira (a RD limita contatos a 120 por minuto).
	maxAttempts: 3,
	// Espera quando a RD não diz quanto esperar: curta, porque a janela de limite é de 1 minuto.
	defaultWaitMs: 2000,
	// Teto de cada espera, para um valor absurdo do servidor não travar o workflow.
	maxWaitMs: 60000,
	// Usa o `sleep` do próprio n8n (o lint do n8n proíbe `setTimeout` solto em community node).
	sleep: (ms: number): Promise<void> => sleep(ms),
};

// Quanto esperar antes de repetir um 429: cabeçalho Retry-After (segundos), depois o
// `remaining_time` do corpo (milissegundos) e por fim o valor fixo.
function retryWaitMs(error: unknown): number {
	const header = Number(
		pick(error, ['cause', 'response', 'headers', 'retry-after']) ??
			pick(error, ['response', 'headers', 'retry-after']),
	);
	const remaining = Number(bodyOf(error).remaining_time);
	let wait = rdRetry.defaultWaitMs;
	if (Number.isFinite(header) && header > 0) wait = header * 1000;
	else if (Number.isFinite(remaining) && remaining > 0) wait = remaining;
	return Math.min(wait, rdRetry.maxWaitMs);
}

/**
 * Traduz um erro HTTP da RD em NodeApiError com mensagem e descrição legíveis.
 * Os textos de `errorHints` ganham da tradução padrão do status, e o resto vira o texto da própria RD.
 */
export function translateRdError(
	node: INode,
	error: unknown,
	itemIndex: number,
	hints: Record<number, RdErrorHint> = {},
): NodeApiError {
	// Erro que não veio da RD (rede, timeout) mantém a mensagem original do n8n.
	const status = statusOf(error);
	const body = bodyOf(error);
	const suffix = ` [item ${itemIndex}]`;
	// O texto específico da operação só vale se a condição do corpo (quando existe) for verdadeira.
	const candidate = status === undefined ? undefined : hints[status];
	const hint =
		candidate?.whenBodyIncludes && !JSON.stringify(body).includes(candidate.whenBodyIncludes)
			? undefined
			: candidate;

	let message: string | undefined;
	let description: string | undefined;
	if (status === 401) {
		message = 'Your RD Station access token is invalid or expired';
		description = 'Reconnect the RD Station credential and run the node again';
	} else if (status === 429) {
		message = 'The RD Station rate limit was reached';
		description = waitText(body);
	} else if (status === 400 || status === 422) {
		const field = firstFieldError(body);
		const flat = pick(body, ['errors', 'error_message']);
		if (field) message = `RD Station rejected the '${field.field}' field: ${field.type}`;
		else if (typeof flat === 'string') message = flat;
	}
	if (hint?.message) message = hint.message;
	if (hint?.description) description = hint.description;

	// Sem tradução específica, usa o texto da RD quando existir e deixa o n8n montar o resto.
	const rdText = pick(body, ['errors', 'error_message']) ?? body.error_message ?? body.error;
	const finalMessage = message ?? (typeof rdText === 'string' ? rdText : undefined) ?? undefined;
	return new NodeApiError(node, (body.errors ? body : (error as JsonObject)) as JsonObject, {
		message: finalMessage ? `${finalMessage}${suffix}` : undefined,
		description,
		httpCode: status === undefined ? undefined : String(status),
		itemIndex,
	});
}

/**
 * Faz uma chamada autenticada à RD.
 * Devolve o corpo da resposta (ou `undefined` quando a RD responde 204) e lança NodeApiError traduzido.
 */
export async function rdMarketingApiRequest(
	this: RdContext,
	method: IHttpRequestMethods,
	path: string,
	options: RdRequestOptions = {},
): Promise<IDataObject> {
	const { body, qs, itemIndex = 0, authentication = 'oAuth2', errorHints } = options;
	// Base, cabeçalho e timeout vão em toda chamada; o corpo só quando existe, para não mandar `{}` num GET.
	const request: IHttpRequestOptions = {
		method,
		baseURL: RD_BASE_URL,
		url: path,
		headers: { 'Content-Type': 'application/json' },
		json: true,
		timeout: RD_TIMEOUT_MS,
		// Listas na query saem repetidas (`assets_type[]=A&assets_type[]=B`), o formato que a RD documenta.
		arrayFormat: 'repeat',
	};
	if (qs && Object.keys(qs).length > 0) request.qs = qs;
	if (Array.isArray(body) || (body && Object.keys(body).length > 0)) {
		request.body = body as IDataObject;
	}
	const credential = credentialName(authentication);
	for (let attempt = 1; ; attempt++) {
		try {
			const response = await this.helpers.httpRequestWithAuthentication.call(
				this,
				credential,
				request,
			);
			// Nas rotas que respondem lista ou 204 o chamador usa `extractItems` ou ignora o retorno.
			return response as IDataObject;
		} catch (error) {
			// 429: a RD recusou por excesso de requisições antes de processar, então repetir é seguro,
			// inclusive em POST. Espera o tempo pedido e tenta de novo, até o teto de tentativas.
			if (statusOf(error) === 429 && attempt < rdRetry.maxAttempts) {
				await rdRetry.sleep(retryWaitMs(error));
				continue;
			}
			// Qualquer outro erro, ou o 429 depois da última tentativa, sobe já traduzido.
			throw translateRdError(this.getNode(), error, itemIndex, errorHints);
		}
	}
}

export interface RdPaginateOptions {
	qs?: IDataObject;
	itemIndex?: number;
	// Tamanho da página que a RD aceita nesta rota; sem ele a rota não tem `page_size`.
	pageSize?: number;
	// Rota que não pagina (campos, catálogo, webhooks): uma chamada só.
	paginated?: boolean;
	// Chave do envelope onde estão os itens; sem ela vale a primeira propriedade que é lista.
	itemsKey?: string;
	returnAll: boolean;
	limit?: number;
	errorHints?: Record<number, RdErrorHint>;
}

/**
 * Lê uma listagem da RD e devolve só os itens, sem o envelope.
 * Com Return All repete `page` (e `page_size`, quando existe) até a página vir curta ou vazia;
 * sem Return All para assim que juntar `limit` itens.
 */
export async function rdMarketingPaginate(
	this: RdContext,
	path: string,
	options: RdPaginateOptions,
): Promise<IDataObject[]> {
	const { pageSize, itemsKey, returnAll, limit, itemIndex = 0, errorHints } = options;
	const paginated = options.paginated ?? true;
	const wanted = returnAll ? Infinity : (limit ?? 50);
	const collected: IDataObject[] = [];

	for (let page = 1; ; page++) {
		// Rota sem paginação não recebe `page`: a RD devolve a lista inteira de uma vez.
		const qs: IDataObject = { ...options.qs };
		// Tamanho da página, igual em TODAS as páginas: a RD calcula o deslocamento como
		// (page - 1) * page_size, então mudar o tamanho no meio da leitura repete e pula registros.
		// Com limite menor que a rota aceita, pedimos só o limite; o excesso é cortado no fim.
		// Rota sem `page_size` não tem tamanho fixo; ali "página cheia" é qualquer página com 1 item.
		const asked = pageSize ? Math.min(pageSize, wanted) : 1;
		if (paginated) {
			qs.page = page;
			if (pageSize) qs.page_size = asked;
		}
		const response = await rdMarketingApiRequest.call(this, 'GET', path, {
			qs,
			itemIndex,
			errorHints,
		});
		const items = extractItems(response, itemsKey);
		collected.push(...items);

		// Parou: rota sem paginação, limite atingido, ou a página veio curta/vazia (acabaram os itens).
		if (!paginated || collected.length >= wanted || items.length < asked) break;
	}
	return collected.slice(0, wanted);
}
