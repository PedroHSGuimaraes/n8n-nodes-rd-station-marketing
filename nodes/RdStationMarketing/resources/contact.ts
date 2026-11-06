/**
 * Recurso Contact: criar, ler, atualizar, apagar e etiquetar contatos, e ler os eventos de um contato.
 *
 * A RD identifica o contato por `uuid`, e-mail ou telefone no caminho da URL (`email:foo@bar.com`).
 * Não existe rota de listagem de contatos, então o identificador é sempre digitado (nunca lista).
 */
import type { IDataObject, INodeProperties } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import {
	customFieldsCollection,
	operationSelector,
	returnAllAndLimit,
	showFor,
} from '../descriptions';
import { compact, contactPath, requireEmailOrPhone, requireValue, splitList } from '../helpers';
import { rdMarketingApiRequest, rdMarketingPaginate } from '../transport';

// Campos do contato aceitos pela RD. `name` é o nome salvo no workflow e `key` é o nome na API;
// guardar os dois lado a lado evita converter camelCase em snake_case por regra de texto.
const CONTACT_FIELDS: Array<{ displayName: string; name: string; key: string; description: string }> = [
	// Texto livre que descreve a pessoa.
	{ displayName: 'Bio', name: 'bio', key: 'bio', description: 'Short biography of the contact' },
	// A RD só aceita a data neste formato.
	{ displayName: 'Birthdate', name: 'birthdate', key: 'birthdate', description: 'Format YYYY-MM-DD' },
	// Localização do contato, três campos de texto simples.
	{ displayName: 'City', name: 'city', key: 'city', description: 'City of the contact' },
	{ displayName: 'Country', name: 'country', key: 'country', description: 'Country of the contact' },
	// Perfis em redes sociais, todos texto livre.
	{ displayName: 'Facebook', name: 'facebook', key: 'facebook', description: 'Facebook profile' },
	// A API usa snake_case (`job_title`); o workflow guarda `jobTitle`.
	{ displayName: 'Job Title', name: 'jobTitle', key: 'job_title', description: 'Job title of the contact' },
	{ displayName: 'LinkedIn', name: 'linkedin', key: 'linkedin', description: 'LinkedIn profile' },
	// Telefones: a RD exige o formato E.164 (`+5511987654321`) e devolve INVALID_PHONE_NUMBER se não vier.
	{
		displayName: 'Mobile Phone',
		name: 'mobilePhone',
		key: 'mobile_phone',
		description: 'Mobile phone in the E.164 format, for example +5511987654321',
	},
	{
		displayName: 'Personal Phone',
		name: 'personalPhone',
		key: 'personal_phone',
		description: 'Personal phone in the E.164 format, for example +5511987654321',
	},
	{
		displayName: 'Phone',
		name: 'phone',
		key: 'phone',
		description: 'Phone in the E.164 format, for example +5511987654321',
	},
	{ displayName: 'State', name: 'state', key: 'state', description: 'State of the contact' },
	{ displayName: 'Twitter', name: 'twitter', key: 'twitter', description: 'Twitter profile' },
	{ displayName: 'Website', name: 'website', key: 'website', description: 'Website of the contact' },
];

// Monta a lista de opções de uma coleção a partir de CONTACT_FIELDS mais os campos extras da operação.
function fieldOptions(extra: INodeProperties[]): INodeProperties[] {
	// Cada campo do contato vira uma opção de texto na coleção.
	const base = CONTACT_FIELDS.map(
		(field): INodeProperties => ({
			displayName: field.displayName,
			name: field.name,
			type: 'string',
			default: '',
			description: field.description,
		}),
	);
	// O lint do n8n exige as opções em ordem alfabética pelo nome mostrado.
	return [...base, ...extra].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Campos que só existem na atualização: e-mail novo, nome e tags (que substituem as antigas).
const UPDATE_EXTRAS: INodeProperties[] = [
	{
		// O e-mail novo só vale quando o contato é achado por uuid ou telefone (veja o handler `update`).
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
		description:
			'New email of the contact. Ignored when the contact is identified by email, because the RD does not accept it.',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		description: 'Full name of the contact',
	},
	{
		// O aviso "Replaces all existing tags" evita apagar tags sem querer: o PATCH da RD substitui tudo.
		displayName: 'Tags',
		name: 'tags',
		type: 'string',
		default: '',
		placeholder: 'e.g. lead, newsletter',
		description: 'Comma-separated tags. Replaces all existing tags.',
	},
];

// Na criação as tags são somadas às que o contato já tem (a RD só acrescenta).
const CREATE_EXTRAS: INodeProperties[] = [
	{
		displayName: 'Tags',
		name: 'tags',
		type: 'string',
		default: '',
		placeholder: 'e.g. lead, newsletter',
		description: 'Comma-separated tags to add to the contact',
	},
];

// Operações que localizam um contato já existente pelo identificador.
const IDENTIFIED = ['get', 'update', 'delete', 'addTags'];

const properties: INodeProperties[] = [
	{
		// Escolhe o tipo do identificador que vai no caminho da URL.
		displayName: 'Identifier Type',
		name: 'identifierType',
		type: 'options',
		options: [
			{ name: 'Email', value: 'email' },
			{ name: 'Phone', value: 'phone' },
			{ name: 'UUID', value: 'uuid' },
		],
		default: 'email',
		description: 'How the contact is identified in the RD Station URL',
		displayOptions: showFor('contact', IDENTIFIED),
	},
	{
		// O valor do identificador; obrigatório porque sem ele não há contato para achar.
		displayName: 'Identifier',
		name: 'identifier',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. name@email.com',
		description: 'Email, phone (E.164 format) or UUID of the contact, as chosen in Identifier Type',
		displayOptions: showFor('contact', IDENTIFIED),
	},
	{
		// E-mail e telefone ficam opcionais na tela porque a RD aceita um OU outro; o handler confere.
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
		description: 'Email of the contact. Provide an email or a phone.',
		displayOptions: showFor('contact', ['create']),
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		description: 'Full name of the contact',
		displayOptions: showFor('contact', ['create']),
	},
	{
		// Todo o resto dos dados do contato fica numa coleção, para a tela de criação não ficar enorme.
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor('contact', ['create']),
		options: fieldOptions(CREATE_EXTRAS),
	},
	{
		// Na atualização só vai para a RD o que a pessoa preencher, porque o PATCH não apaga o que faltar.
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor('contact', ['update']),
		options: fieldOptions(UPDATE_EXTRAS),
	},
	// Campos personalizados da conta (`cf_*`), escolhidos de uma lista lida da própria RD.
	customFieldsCollection('contact', ['create', 'update']),
	{
		// Etiquetas que a operação Add Tags acrescenta ao contato.
		displayName: 'Tags',
		name: 'tags',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. lead, newsletter',
		description: 'Comma-separated tags to add to the contact',
		displayOptions: showFor('contact', ['addTags']),
	},
	{
		// A UX guideline do n8n pede um Simplify; fica desligado para não esconder campos de quem já usa.
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: false,
		description: 'Whether to return only the main fields of the contact',
		displayOptions: showFor('contact', ['get']),
	},
	{
		// A rota de eventos só aceita o uuid no caminho, por isso o campo não segue o Identifier Type.
		displayName: 'Contact UUID',
		name: 'contactUuid',
		type: 'string',
		required: true,
		default: '',
		description: 'UUID of the contact (the events route only accepts the UUID)',
		displayOptions: showFor('contact', ['getEvents']),
	},
	{
		// A RD obriga a escolher o tipo; só existem estes dois.
		displayName: 'Event Type',
		name: 'eventType',
		type: 'options',
		options: [
			{ name: 'Conversion', value: 'CONVERSION' },
			{ name: 'Opportunity', value: 'OPPORTUNITY' },
		],
		default: 'CONVERSION',
		description: 'Kind of event to list',
		displayOptions: showFor('contact', ['getEvents']),
	},
	// Return All e Limit da listagem de eventos.
	...returnAllAndLimit('contact', ['getEvents']),
];

// Campos que o Simplify mantém no Contact Get (lista fechada do plano, critério 10 do S3).
const SIMPLE_FIELDS = [
	'uuid',
	'name',
	'email',
	'phone',
	'job_title',
	'city',
	'state',
	'country',
	'tags',
	'website',
];

// Converte os campos da tela (nomes do workflow) nos campos da API e transforma o texto das tags em lista.
function mapFields(fields: IDataObject): IDataObject {
	const body: IDataObject = {};
	// Troca o nome do workflow pelo nome da API, só para o que foi preenchido.
	for (const field of CONTACT_FIELDS) {
		if (fields[field.name] !== undefined) body[field.key] = fields[field.name];
	}
	// E-mail e nome têm o mesmo nome nos dois lados, por isso ficam fora da tabela.
	if (fields.email !== undefined) body.email = fields.email;
	if (fields.name !== undefined) body.name = fields.name;
	// A RD espera as tags como lista de textos.
	if (typeof fields.tags === 'string') body.tags = splitList(fields.tags);
	// Tira o que ficou vazio: a RD trata campo vazio enviado como pedido para apagar o dado.
	return compact(body);
}

// Lê os campos personalizados escolhidos na tela e devolve `{ cf_plano: 'Pro' }` pronto para o corpo.
function readCustomFields(parameter: unknown): IDataObject {
	const values = (parameter as { values?: Array<{ field?: string; value?: unknown }> } | undefined)
		?.values;
	const result: IDataObject = {};
	// A chave do campo já vem com o prefixo `cf_` (é o `api_identifier`), então entra como está.
	for (const entry of values ?? []) {
		if (entry.field) result[entry.field] = entry.value as string;
	}
	return result;
}

// Contact → Get: busca um contato pelo identificador e devolve o objeto (ou só os campos principais).
const get: OperationHandler = async function (i) {
	const type = this.getNodeParameter('identifierType', i) as string;
	const identifier = this.getNodeParameter('identifier', i) as string;
	// Sem identificador o caminho seria `/contacts/email:`, uma rota que a RD não tem.
	requireValue(this, i, identifier, 'Identifier');
	const contact = await rdMarketingApiRequest.call(this, 'GET', contactPath(type, identifier), {
		itemIndex: i,
		// 404 aqui quase sempre é identificador errado, então o texto aponta para esse conserto.
		errorHints: {
			404: {
				message: 'The contact was not found',
				description: 'Check the identifier type and the value, then run the node again',
			},
		},
	});
	// Sem Simplify devolve o contato inteiro, com todos os campos que a RD enviou.
	if (!this.getNodeParameter('simplify', i, false)) return contact;
	// Com Simplify copia só os campos principais, na ordem do plano.
	const simple: IDataObject = {};
	for (const key of SIMPLE_FIELDS) {
		if (contact[key] !== undefined) simple[key] = contact[key];
	}
	return simple;
};

// Contact → Create: cria o contato; a RD recusa e-mail ou telefone repetido.
const create: OperationHandler = async function (i) {
	const email = this.getNodeParameter('email', i, '') as string;
	const name = this.getNodeParameter('name', i, '') as string;
	const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	// A RD recusa o contato sem e-mail e sem telefone; falhar aqui poupa a ida à rede.
	requireEmailOrPhone(this, i, email, additional.phone);
	// Junta os campos padrão com os personalizados num corpo só.
	const body = {
		...mapFields({ ...additional, email, name }),
		...readCustomFields(this.getNodeParameter('customFields', i, {})),
	};
	return rdMarketingApiRequest.call(this, 'POST', '/platform/contacts', { body, itemIndex: i });
};

// Contact → Update: o PATCH da RD também cria o contato se ele não existir.
const update: OperationHandler = async function (i) {
	const type = this.getNodeParameter('identifierType', i) as string;
	const identifier = this.getNodeParameter('identifier', i) as string;
	requireValue(this, i, identifier, 'Identifier');
	const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
	// Mesmo corpo da criação: campos padrão mais personalizados.
	const body = {
		...mapFields(fields),
		...readCustomFields(this.getNodeParameter('customFields', i, {})),
	};
	// Contato achado por e-mail: a RD recusa o campo `email` no corpo (regra da página do PATCH).
	if (type === 'email') delete body.email;
	return rdMarketingApiRequest.call(this, 'PATCH', contactPath(type, identifier), {
		body,
		itemIndex: i,
	});
};

// Contact → Delete: a RD responde 204 sem corpo.
const remove: OperationHandler = async function (i) {
	const type = this.getNodeParameter('identifierType', i) as string;
	const identifier = this.getNodeParameter('identifier', i) as string;
	requireValue(this, i, identifier, 'Identifier');
	await rdMarketingApiRequest.call(this, 'DELETE', contactPath(type, identifier), { itemIndex: i });
	// Devolve um item para o workflow poder seguir, como a UX guideline do n8n pede no delete.
	return { deleted: true };
};

// Contact → Add Tags: acrescenta etiquetas sem tirar as que o contato já tem.
const addTags: OperationHandler = async function (i) {
	const type = this.getNodeParameter('identifierType', i) as string;
	const identifier = this.getNodeParameter('identifier', i) as string;
	requireValue(this, i, identifier, 'Identifier');
	const tags = splitList(this.getNodeParameter('tags', i));
	// Lista vazia faria a RD responder 400 depois da ida à rede.
	requireValue(this, i, tags, 'Tags');
	return rdMarketingApiRequest.call(this, 'POST', `${contactPath(type, identifier)}/tag`, {
		body: { tags },
		itemIndex: i,
	});
};

// Contact → Get Events: lista conversões ou oportunidades do contato.
const getEvents: OperationHandler = async function (i) {
	const uuid = this.getNodeParameter('contactUuid', i) as string;
	requireValue(this, i, uuid, 'Contact UUID');
	// A página da RD não documenta total nem tamanho de página: Return All repete `page` até vir vazia.
	return rdMarketingPaginate.call(this, `/platform/contacts/${uuid}/events`, {
		qs: { event_type: this.getNodeParameter('eventType', i) as string },
		returnAll: this.getNodeParameter('returnAll', i, false) as boolean,
		limit: this.getNodeParameter('limit', i, 50) as number,
		itemIndex: i,
	});
};

export const contactResource: ResourceModule = {
	value: 'contact',
	name: 'Contact',
	operationSelector: operationSelector(
		'contact',
		[
			{
				name: 'Add Tags',
				value: 'addTags',
				action: 'Add tags to a contact',
				description: 'Add tags to a contact',
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a contact',
				description: 'Create a new contact',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a contact',
				description: 'Delete a contact',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a contact',
				description: 'Get a contact by UUID, email or phone',
			},
			{
				name: 'Get Events',
				value: 'getEvents',
				action: 'Get the events of a contact',
				description: 'Get the conversion or opportunity events of a contact',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a contact',
				description: 'Update a contact, or create it when it does not exist',
			},
		],
		'get',
	),
	properties,
	// A chave `delete` é palavra reservada em objeto só como variável; por isso a função se chama `remove`.
	handlers: { get, create, update, delete: remove, addTags, getEvents },
};
