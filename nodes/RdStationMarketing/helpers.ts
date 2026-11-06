/**
 * Funções puras e validações que as operações do node usam.
 *
 * Nada aqui chama a RD. Ficam aqui o envelope das listas, a conversão de texto em lista, as
 * validações que precisam falhar antes de gastar uma requisição (campo vazio, datas invertidas, JSON
 * inválido) e a montagem do corpo sem campos vazios. Manter isso fora das operações permite testar
 * cada regra pelo `execute` sem repetir código em cada recurso.
 */
import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// A RD devolve a lista em envelopes diferentes por rota: array na raiz, `{ items }`, `{ segmentations }`
// e até `{ wokflows }` com a chave grafada errado. Procura a chave pedida (aceita caminho com ponto,
// como `leads_left_details.leads`) e, se ela não existir, usa a primeira propriedade que é lista.
export function extractItems(response: unknown, itemsKey?: string): IDataObject[] {
	if (Array.isArray(response)) return response as IDataObject[];
	if (response === null || typeof response !== 'object') return [];
	const record = response as Record<string, unknown>;
	if (itemsKey) {
		let current: unknown = record;
		for (const key of itemsKey.split('.')) {
			current =
				current !== null && typeof current === 'object'
					? (current as Record<string, unknown>)[key]
					: undefined;
		}
		if (Array.isArray(current)) return current as IDataObject[];
	}
	const firstList = Object.values(record).find((value) => Array.isArray(value));
	return (firstList as IDataObject[] | undefined) ?? [];
}

// Quebra um texto separado por vírgula em lista, sem espaços nem itens vazios ("a, b" vira ["a","b"]).
export function splitList(text: unknown): string[] {
	if (typeof text !== 'string') return [];
	return text
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part !== '');
}

// Diz se um valor de parâmetro está vazio para a RD: undefined, null, texto em branco ou lista sem itens.
export function isEmpty(value: unknown): boolean {
	if (value === undefined || value === null) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

// Copia só os campos preenchidos. A RD trata campo vazio enviado como valor (apaga o dado), então
// o corpo nunca leva "" nem null por engano.
export function compact(fields: IDataObject): IDataObject {
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(fields)) {
		if (!isEmpty(value)) result[key] = value as IDataObject[string];
	}
	return result;
}

// Exige um parâmetro preenchido; a mensagem cita o nome que a pessoa vê na tela.
export function requireValue(
	context: IExecuteFunctions,
	itemIndex: number,
	value: unknown,
	displayName: string,
): void {
	if (isEmpty(value)) {
		throw new NodeOperationError(
			context.getNode(),
			`The '${displayName}' parameter is empty [item ${itemIndex}]`,
			{ itemIndex },
		);
	}
}

// A RD pede que o contato tenha e-mail ou telefone; sem os dois a criação falharia depois da ida à rede.
export function requireEmailOrPhone(
	context: IExecuteFunctions,
	itemIndex: number,
	email: unknown,
	phone: unknown,
	description = 'The contact needs at least one of them to be created',
): void {
	if (isEmpty(email) && isEmpty(phone)) {
		throw new NodeOperationError(
			context.getNode(),
			`Provide an email or a phone [item ${itemIndex}]`,
			{
				itemIndex,
				description,
			},
		);
	}
}

// Reduz data ou data-hora ao formato `YYYY-MM-DD`, o único que a RD documenta para filtros de data.
export function dateOnly(value: unknown): string {
	return String(value ?? '').slice(0, 10);
}

// Falha antes da requisição quando a data final vem antes da inicial.
export function assertDateRange(
	context: IExecuteFunctions,
	itemIndex: number,
	startDate: unknown,
	endDate: unknown,
): { start_date: string; end_date: string } {
	const start = dateOnly(startDate);
	const end = dateOnly(endDate);
	// Datas `YYYY-MM-DD` ordenam como texto, então a comparação direta basta.
	if (end < start) {
		throw new NodeOperationError(
			context.getNode(),
			`The 'End Date' is before the 'Start Date' [item ${itemIndex}]`,
			{ itemIndex, description: 'Set an end date that is the same as or after the start date' },
		);
	}
	return { start_date: start, end_date: end };
}

// Lê um parâmetro que chega como JSON (texto ou objeto já pronto) e falha com a mensagem do plano.
export function parseJsonParameter(
	context: IExecuteFunctions,
	itemIndex: number,
	value: unknown,
	displayName: string,
): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		throw new NodeOperationError(
			context.getNode(),
			`The '${displayName}' parameter is not valid JSON [item ${itemIndex}]`,
			{ itemIndex, description: 'Check the commas, quotes and brackets of the JSON' },
		);
	}
}

// Monta o trecho `<tipo>:<valor>` que a RD usa para achar um contato por uuid, e-mail ou telefone.
export function contactPath(identifierType: string, identifier: string): string {
	return `/platform/contacts/${identifierType}:${encodeURIComponent(identifier).replace(/%40/g, '@').replace(/%2B/g, '+')}`;
}
