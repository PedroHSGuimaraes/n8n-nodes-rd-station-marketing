/**
 * Listas pesquisáveis (`listSearch`) e opções dinâmicas (`loadOptions`) do node de ação.
 *
 * O editor do n8n chama estas funções para preencher os dropdowns "From list" dos IDs e as listas de
 * campos personalizados e de ações de fluxo, sempre com a conta RD da pessoa. Todas passam por
 * `rdMarketingApiRequest`, então herdam o timeout e a tradução de erros do transporte.
 */
import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';

import { extractItems } from './helpers';
import { rdMarketingApiRequest } from './transport';

// Assinatura que o n8n espera de um método `listSearch`.
export type ListSearchMethod = (
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) => Promise<INodeListSearchResult>;

interface ListSearchConfig {
	path: string;
	// Chave do envelope onde estão os itens (sem ela vale a primeira propriedade que é lista).
	itemsKey?: string;
	// Máximo de itens por página que a rota aceita; sem ele a rota devolve tudo e não recebe `page`.
	pageSize?: number;
	// Nome do parâmetro de busca da RD (`search` ou `query`); sem ele filtramos aqui, no node.
	searchParam?: string;
	// Como cada registro da RD vira uma linha `{ name, value }` do dropdown.
	toResult: (item: IDataObject) => INodeListSearchItems;
	// Linhas fixas mostradas no começo da primeira página quando a busca está vazia.
	fixedFirst?: INodeListSearchItems[];
}

// Cria um método `listSearch` a partir da descrição da rota: assim cada dropdown vira 5 linhas de
// configuração em vez de uma função copiada e levemente diferente.
export function makeListSearch(config: ListSearchConfig): ListSearchMethod {
	return async function (this, filter, paginationToken) {
		const page = Number(paginationToken ?? 1);
		const qs: IDataObject = {};
		// Rotas paginadas recebem a página pedida pelo editor (o scroll do dropdown).
		if (config.pageSize) {
			qs.page = page;
			qs.page_size = config.pageSize;
		}
		// A busca vai para a RD quando ela tem parâmetro próprio.
		if (filter && config.searchParam) qs[config.searchParam] = filter;
		const response = await rdMarketingApiRequest.call(this, 'GET', config.path, { qs });
		const items = extractItems(response, config.itemsKey);
		let results = items.map(config.toResult);
		// Sem parâmetro de busca na RD, filtra pelo texto mostrado, ignorando maiúsculas.
		if (filter && !config.searchParam) {
			const wanted = filter.toLowerCase();
			results = results.filter((row) => String(row.name).toLowerCase().includes(wanted));
		}
		// As linhas fixas só aparecem na primeira página e sem busca.
		if (!filter && page === 1 && config.fixedFirst) results = [...config.fixedFirst.flat(), ...results];
		// Há mais páginas quando esta veio cheia; o editor devolve o token ao rolar a lista.
		const hasMore = Boolean(config.pageSize) && items.length >= (config.pageSize ?? 0);
		return { results, paginationToken: hasMore ? String(page + 1) : undefined };
	};
}

// Lê o texto em português de um campo `{ default, 'pt-BR' }` que a RD usa em nome e rótulo.
function localized(value: unknown): string | undefined {
	if (value === null || typeof value !== 'object') return undefined;
	const record = value as Record<string, unknown>;
	const text = record['pt-BR'] ?? record.default;
	return typeof text === 'string' ? text : undefined;
}

// Texto que identifica um campo personalizado para a pessoa: rótulo, nome ou o próprio identificador.
function fieldLabel(field: IDataObject): string {
	return localized(field.label) ?? localized(field.name) ?? String(field.api_identifier);
}

// Dropdown de campos personalizados nas telas de criar e atualizar campo (valor = uuid do campo).
export const searchCustomFields = makeListSearch({
	path: '/platform/contacts/fields',
	itemsKey: 'fields',
	toResult: (field) => ({
		name: `${fieldLabel(field)} (${String(field.api_identifier)})`,
		value: String(field.uuid),
	}),
});

// Lista campos personalizados para o dropdown "Custom Fields" do contato e da conversão.
// Mantém só os `custom_field` verdadeiros: os campos padrão (e-mail, nome) já têm campo próprio na tela.
export async function getCustomFieldNames(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const response = await rdMarketingApiRequest.call(this, 'GET', '/platform/contacts/fields');
	return extractItems(response, 'fields')
		.filter((field) => field.custom_field === true)
		.map((field) => ({ name: fieldLabel(field), value: String(field.api_identifier) }));
}
