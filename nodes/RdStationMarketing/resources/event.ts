/**
 * Recurso Event: envia eventos de conversão, qualificação, chat, ligação, mídia e e-commerce.
 *
 * A RD recebe todos os tipos na mesma rota (`POST /platform/events`); o tipo vai em `event_type` e
 * os dados do contato e do evento vão em `payload`. A única exceção é a conversão por chave de API,
 * que usa `POST /platform/conversions`. Cada operação tipada monta o `payload` com os campos que a
 * RD marca como obrigatórios, para o erro aparecer antes da ida à rede.
 */
import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import { customFieldsCollection, operationSelector, showFor } from '../descriptions';
import {
	compact,
	isEmpty,
	parseJsonParameter,
	requireEmailOrPhone,
	requireValue,
	splitList,
} from '../helpers';
import { rdMarketingApiRequest } from '../transport';

// A RD só aceita lotes de até 0,2 MB (200000 bytes); acima disso recusa o corpo inteiro.
const MAX_BATCH_BYTES = 200000;

// Um campo opcional do `payload`: `name` é o nome salvo no workflow e `key` o nome na API.
interface PayloadField {
	displayName: string;
	name: string;
	key: string;
	description: string;
	type?: 'string' | 'number' | 'boolean';
}

// Atalho para declarar um campo opcional em uma linha, sem repetir o formato do objeto.
const optional = (
	displayName: string,
	name: string,
	key: string,
	description: string,
	type: PayloadField['type'] = 'string',
): PayloadField => ({ displayName, name, key, description, type });

// Campos opcionais da conversão. Dados do contato primeiro, depois origem do tráfego e consentimento.
const CONVERSION_FIELDS: PayloadField[] = [
	// Consentimento: se o contato aceita receber e-mails.
	optional('Available For Mailing', 'availableForMailing', 'available_for_mailing', 'Whether the contact accepts receiving emails', 'boolean'),
	// Localização do contato.
	optional('City', 'city', 'city', 'City of the contact'),
	optional('Country', 'country', 'country', 'Country of the contact'),
	optional('State', 'state', 'state', 'State of the contact'),
	// O cookie `_rdtrk` liga a visita do site ao contato na RD.
	optional('Client Tracking ID', 'clientTrackingId', 'client_tracking_id', 'Value of the _rdtrk cookie, used to link the visit to the contact'),
	// Dados da empresa do contato.
	optional('Company Name', 'companyName', 'company_name', 'Name of the contact company'),
	optional('Company Site', 'companySite', 'company_site', 'Website of the contact company'),
	// Dados pessoais do contato.
	optional('Job Title', 'jobTitle', 'job_title', 'Job title of the contact'),
	optional('Name', 'name', 'name', 'Full name of the contact'),
	optional('Website', 'website', 'website', 'Website of the contact'),
	// Telefones: a RD exige o formato E.164.
	optional('Mobile Phone', 'mobilePhone', 'mobile_phone', 'Mobile phone in the E.164 format'),
	optional('Personal Phone', 'personalPhone', 'personal_phone', 'Personal phone in the E.164 format'),
	optional('Phone', 'phone', 'phone', 'Phone in the E.164 format, for example +5511987654321'),
	// As tags chegam separadas por vírgula e viram lista no payload.
	optional('Tags', 'tags', 'tags', 'Comma-separated tags'),
	// Origem do tráfego que trouxe o contato.
	optional('Traffic Campaign', 'trafficCampaign', 'traffic_campaign', 'Campaign that brought the contact'),
	optional('Traffic Medium', 'trafficMedium', 'traffic_medium', 'Medium that brought the contact'),
	optional('Traffic Source', 'trafficSource', 'traffic_source', 'Source that brought the contact'),
];

// O telefone e o nome são os únicos extras que as outras operações reaproveitam.
const PHONE_FIELD: PayloadField = CONVERSION_FIELDS.find((f) => f.name === 'phone') as PayloadField;
const NAME_FIELD: PayloadField = CONVERSION_FIELDS.find((f) => f.name === 'name') as PayloadField;

// Campos opcionais do evento de ligação.
const CALL_FIELDS: PayloadField[] = [
	// Duração em segundos e início no formato RFC 3339.
	optional('Call Duration', 'callDuration', 'call_duration', 'Duration of the call in seconds', 'number'),
	optional('Call Started At', 'callStartedAt', 'call_started_at', 'Start of the call in the RFC 3339 format'),
	// Link da gravação, tipo da chamada e usuário que ligou.
	optional('Call Record', 'callRecord', 'call_record', 'URL of the call recording'),
	optional('Call Type', 'callType', 'call_type', 'Type of the call'),
	optional('Call User Email', 'callUserEmail', 'call_user_email', 'Email of the user who made the call'),
	optional('Call Status Description', 'callStatusDescription', 'call_status_description', 'Free text that describes the status'),
	PHONE_FIELD,
];

// Campos opcionais do evento de mídia.
const MEDIA_FIELDS: PayloadField[] = [
	optional('Media Category', 'mediaCategory', 'media_category', 'Category of the media'),
	optional('Media Duration', 'mediaDuration', 'media_duration', 'Duration of the media in seconds', 'number'),
	PHONE_FIELD,
];

// Constrói a coleção "Additional Fields" de um grupo de operações a partir da lista de campos.
function additionalFields(operations: string[], fields: PayloadField[]): INodeProperties {
	return {
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor('event', operations),
		// A lista fica em ordem alfabética pelo nome mostrado, como o lint do n8n exige.
		options: fields
			.map(
				(field): INodeProperties => ({
					displayName: field.displayName,
					name: field.name,
					type: field.type ?? 'string',
					// O valor padrão acompanha o tipo do campo (booleano, número ou texto).
					default: field.type === 'boolean' ? false : field.type === 'number' ? 0 : '',
					description: field.description,
				}),
			)
			.sort((a, b) => a.displayName.localeCompare(b.displayName)),
	};
}

// Os oito eventos de e-commerce atuais. Os quatro antigos (ORDER_PLACED, CART_ABANDONED e seus itens)
// foram descontinuados em 31/12/2025 e ficam de fora (decisão AD-007).
const ECOMMERCE_EVENTS = [
	'ECOMMERCE_CART_ABANDONED',
	'ECOMMERCE_CHECKOUT_STARTED',
	'ECOMMERCE_ORDER_CANCELLED',
	'ECOMMERCE_ORDER_FULFILLED',
	'ECOMMERCE_ORDER_PAID',
	'ECOMMERCE_ORDER_PLACED',
	'ECOMMERCE_ORDER_REFUNDED',
	'ECOMMERCE_SHIPMENT_DELIVERED',
];

// Transforma `ECOMMERCE_ORDER_PLACED` em "Ecommerce Order Placed" para a lista da tela.
const readable = (code: string): string =>
	code
		.toLowerCase()
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

// Declara um campo de texto obrigatório ou não de uma operação de evento, sem repetir o objeto inteiro.
const text = (
	displayName: string,
	name: string,
	operations: string[],
	description: string,
	extra: Partial<INodeProperties> = {},
): INodeProperties => ({
	displayName,
	name,
	type: 'string',
	default: '',
	description,
	displayOptions: showFor('event', operations),
	...extra,
});

// Operações que precisam localizar um contato por e-mail.
const WITH_EMAIL = [
	'sendConversion',
	'markOpportunity',
	'markSale',
	'markLostOpportunity',
	'sendChatEvent',
	'sendCallFinished',
	'sendMediaEvent',
];

const properties: INodeProperties[] = [
	{
		// Só a conversão tem escolha de autenticação, porque só ela aceita a chave de API.
		displayName: 'Authentication',
		name: 'authentication',
		type: 'options',
		options: [
			{ name: 'API Key', value: 'apiKey' },
			{ name: 'OAuth2', value: 'oAuth2' },
		],
		default: 'oAuth2',
		description: 'The RD Station API key only works for conversions',
		displayOptions: showFor('event', ['sendConversion']),
	},
	// Identificador da conversão, o mesmo que a RD mostra nos relatórios.
	text('Conversion Identifier', 'conversionIdentifier', ['sendConversion'], 'Identifier of the conversion in RD Station', {
		required: true,
		placeholder: 'e.g. newsletter',
	}),
	// E-mail do contato; a RD aceita e-mail ou telefone, e o telefone fica nos campos adicionais.
	text('Email', 'email', WITH_EMAIL, 'Email of the contact. Provide an email or a phone.', {
		placeholder: 'name@email.com',
	}),
	{
		// Valor da venda; zero significa "sem valor", porque o campo numérico do n8n não fica vazio.
		displayName: 'Value',
		name: 'value',
		type: 'number',
		default: 0,
		description: 'Value of the sale. Leave at 0 to not send a value.',
		displayOptions: showFor('event', ['markSale']),
	},
	// Motivo obrigatório da oportunidade perdida.
	text('Reason', 'reason', ['markLostOpportunity'], 'Why the opportunity was lost', {
		required: true,
		placeholder: 'e.g. No budget',
	}),
	{
		// Chat: se começou ou terminou define o tipo do evento e quais campos são obrigatórios.
		displayName: 'Chat Event',
		name: 'chatEvent',
		type: 'options',
		options: [
			{ name: 'Finished', value: 'Finished' },
			{ name: 'Started', value: 'Started' },
		],
		default: 'Started',
		description: 'Whether the chat started or finished',
		displayOptions: showFor('event', ['sendChatEvent']),
	},
	// Assunto do chat (obrigatório quando começou).
	text('Chat Subject', 'chatSubject', ['sendChatEvent'], 'Subject of the chat. Required when the chat started.'),
	{
		// Status do atendente durante o chat.
		displayName: 'Chat Status',
		name: 'chatStatus',
		type: 'options',
		options: [
			{ name: 'Offline', value: 'offline' },
			{ name: 'Online', value: 'online' },
		],
		default: 'online',
		description: 'Whether the agent was online when the chat happened',
		displayOptions: showFor('event', ['sendChatEvent']),
	},
	{
		// A transcrição só aparece (e só é exigida) quando o chat terminou.
		displayName: 'Transcript Message',
		name: 'chatTranscript',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description: 'Transcript of the chat. Required when the chat finished.',
		displayOptions: { show: { resource: ['event'], operation: ['sendChatEvent'], chatEvent: ['Finished'] } },
	},
	// Número de origem e resultado da ligação, ambos obrigatórios na RD.
	text('Call From Number', 'callFromNumber', ['sendCallFinished'], 'Phone number the call came from', {
		required: true,
		placeholder: 'e.g. +5511987654321',
	}),
	text('Call Status', 'callStatus', ['sendCallFinished'], 'Result of the call', {
		required: true,
		placeholder: 'e.g. answered',
	}),
	{
		// Mídia: iniciada ou parada define o tipo do evento.
		displayName: 'Media Event',
		name: 'mediaEvent',
		type: 'options',
		options: [
			{ name: 'Started', value: 'Started' },
			{ name: 'Stopped', value: 'Stopped' },
		],
		default: 'Started',
		description: 'Whether the playback started or stopped',
		displayOptions: showFor('event', ['sendMediaEvent']),
	},
	{
		// A RD espera o tipo da mídia em português ("Áudio" ou "Vídeo").
		displayName: 'Media Type',
		name: 'mediaType',
		type: 'options',
		options: [
			{ name: 'Audio', value: 'Áudio' },
			{ name: 'Video', value: 'Vídeo' },
		],
		default: 'Vídeo',
		description: 'Kind of media that was played',
		displayOptions: showFor('event', ['sendMediaEvent']),
	},
	// Identificador da mídia, obrigatório.
	text('Media Identifier', 'mediaIdentifier', ['sendMediaEvent'], 'Identifier of the media', {
		required: true,
		placeholder: 'e.g. lesson-01',
	}),
	{
		// Tipo do evento de e-commerce; só os oito atuais aparecem.
		displayName: 'Event Type',
		name: 'eventType',
		type: 'options',
		options: ECOMMERCE_EVENTS.map((code) => ({ name: readable(code), value: code })),
		default: 'ECOMMERCE_ORDER_PLACED',
		description: 'Type of the e-commerce event',
		displayOptions: showFor('event', ['sendCustomEvent']),
	},
	{
		// Corpo do evento em JSON; a RD valida os campos de cada tipo.
		displayName: 'Payload',
		name: 'payload',
		type: 'json',
		required: true,
		default: '{}',
		description: 'Payload of the event as JSON, with the fields described in the RD Station documentation',
		displayOptions: showFor('event', ['sendCustomEvent']),
	},
	{
		// Lista de eventos do lote; o rótulo é "Payload" porque a mensagem de erro de JSON usa esse nome.
		displayName: 'Payload',
		name: 'events',
		type: 'json',
		required: true,
		default: '[]',
		description:
			'JSON array of events. Each event has event_type, event_family (CDP) and payload. The body can have up to 0.2 MB.',
		displayOptions: showFor('event', ['sendBatch']),
	},
	// Campos extras de cada grupo de operações.
	additionalFields(['sendConversion'], CONVERSION_FIELDS),
	additionalFields(['markOpportunity', 'markSale', 'markLostOpportunity'], [PHONE_FIELD]),
	additionalFields(['sendChatEvent'], [PHONE_FIELD, NAME_FIELD]),
	additionalFields(['sendCallFinished'], CALL_FIELDS),
	additionalFields(['sendMediaEvent'], MEDIA_FIELDS),
	// Campos personalizados (`cf_*`) só entram na conversão: os eventos de qualificação não os aceitam.
	customFieldsCollection('event', ['sendConversion']),
];

// Copia os campos adicionais preenchidos para o `payload`, trocando o nome do workflow pelo da API.
function mapAdditional(additional: IDataObject, fields: PayloadField[]): IDataObject {
	const payload: IDataObject = {};
	for (const field of fields) {
		const value = additional[field.name];
		// Campo que a pessoa não adicionou não vai para a RD.
		if (value === undefined) continue;
		// Tags chegam como texto separado por vírgula e a RD espera uma lista.
		payload[field.key] = field.name === 'tags' ? splitList(value) : (value as string);
	}
	return payload;
}

// Lê os campos personalizados escolhidos na tela e devolve `{ cf_plano: 'Pro' }`.
function readCustomFields(context: IExecuteFunctions, i: number): IDataObject {
	const parameter = context.getNodeParameter('customFields', i, {}) as {
		values?: Array<{ field?: string; value?: unknown }>;
	};
	const result: IDataObject = {};
	// A chave já traz o prefixo `cf_` (é o `api_identifier`), então entra como está.
	for (const entry of parameter.values ?? []) {
		if (entry.field) result[entry.field] = entry.value as string;
	}
	return result;
}

// Configuração de uma operação de evento tipada.
interface EventConfig {
	// Tipo do evento; pode depender de uma escolha da tela (chat iniciado ou terminado).
	eventType: (context: IExecuteFunctions, i: number) => string;
	// Campos opcionais aceitos nos "Additional Fields" desta operação.
	fields: PayloadField[];
	// Campos próprios da operação, já validados.
	build: (context: IExecuteFunctions, i: number) => IDataObject;
}

// Fábrica das operações tipadas: confere o contato, monta o payload e envia o evento.
function eventOperation(config: EventConfig): OperationHandler {
	return async function (i) {
		const email = this.getNodeParameter('email', i, '') as string;
		const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		// A RD localiza o contato por e-mail ou telefone; sem os dois o evento seria recusado.
		requireEmailOrPhone(
			this,
			i,
			email,
			additional.phone,
			'The event needs an email or a phone to find the contact',
		);
		// Campos próprios da operação primeiro, para os obrigatórios falharem antes de qualquer envio.
		const own = config.build(this, i);
		const payload = compact({ email, ...mapAdditional(additional, config.fields), ...own });
		const body = { event_type: config.eventType(this, i), event_family: 'CDP', payload };
		return rdMarketingApiRequest.call(this, 'POST', '/platform/events', { body, itemIndex: i });
	};
}

// Event → Send Conversion: única operação que aceita chave de API (rota `/platform/conversions`).
const sendConversion: OperationHandler = async function (i) {
	const email = this.getNodeParameter('email', i, '') as string;
	const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	// Mesma regra das demais: e-mail ou telefone, para a RD achar ou criar o contato.
	requireEmailOrPhone(
		this,
		i,
		email,
		additional.phone,
		'The conversion needs an email or a phone to find the contact',
	);
	const identifier = this.getNodeParameter('conversionIdentifier', i) as string;
	requireValue(this, i, identifier, 'Conversion Identifier');
	const authentication = this.getNodeParameter('authentication', i, 'oAuth2') as 'oAuth2' | 'apiKey';
	// Campos padrão e personalizados vão juntos dentro do payload.
	const payload = compact({
		conversion_identifier: identifier,
		email,
		...mapAdditional(additional, CONVERSION_FIELDS),
		...readCustomFields(this, i),
	});
	const body = { event_type: 'CONVERSION', event_family: 'CDP', payload };
	// Com chave de API a rota é outra; a chave viaja na query pela credencial, nunca pelo corpo.
	const path = authentication === 'apiKey' ? '/platform/conversions' : '/platform/events';
	return rdMarketingApiRequest.call(this, 'POST', path, { body, itemIndex: i, authentication });
};

// Event → Send Custom Event: usado para os eventos de e-commerce, cujo payload tem listas de itens.
const sendCustomEvent: OperationHandler = async function (i) {
	const eventType = this.getNodeParameter('eventType', i) as string;
	// JSON inválido falha aqui, antes da ida à rede.
	const payload = parseJsonParameter(this, i, this.getNodeParameter('payload', i), 'Payload');
	const body = { event_type: eventType, event_family: 'CDP', payload } as IDataObject;
	return rdMarketingApiRequest.call(this, 'POST', '/platform/events', { body, itemIndex: i });
};

// Event → Send Batch: vários eventos de uma vez, no limite de 0,2 MB que a RD aceita.
const sendBatch: OperationHandler = async function (i) {
	const events = parseJsonParameter(this, i, this.getNodeParameter('events', i), 'Payload');
	// O corpo do lote é uma lista; qualquer outra forma seria recusada pela RD.
	if (!Array.isArray(events)) {
		throw new NodeOperationError(
			this.getNode(),
			`The 'Payload' parameter must be a JSON array [item ${i}]`,
			{ itemIndex: i },
		);
	}
	// Mede os bytes do texto que vai pela rede (acentos ocupam mais de um byte).
	if (Buffer.byteLength(JSON.stringify(events), 'utf8') > MAX_BATCH_BYTES) {
		throw new NodeOperationError(this.getNode(), `The batch is larger than 0.2 MB [item ${i}]`, {
			itemIndex: i,
			description: 'Split the events into smaller batches',
		});
	}
	return rdMarketingApiRequest.call(this, 'POST', '/platform/events/batch', {
		body: events as IDataObject[],
		itemIndex: i,
	});
};

// Operações de qualificação: o contato precisa existir e o funil só pode ser o `default`.
const FUNNEL = { funnel_name: 'default' };

// Mark Sale: o valor é opcional; vazio ou zero não é enviado.
function saleFields(context: IExecuteFunctions, i: number): IDataObject {
	const value = context.getNodeParameter('value', i, 0) as number | string;
	return isEmpty(value) || Number(value) === 0 ? FUNNEL : { ...FUNNEL, value: Number(value) };
}

// Mark Lost Opportunity: o motivo é obrigatório.
function lostFields(context: IExecuteFunctions, i: number): IDataObject {
	const reason = context.getNodeParameter('reason', i, '') as string;
	requireValue(context, i, reason, 'Reason');
	return { ...FUNNEL, reason };
}

// Chat: iniciado exige o assunto e terminado exige a transcrição (regras da RD).
function chatFields(context: IExecuteFunctions, i: number): IDataObject {
	const finished = context.getNodeParameter('chatEvent', i) === 'Finished';
	const subject = context.getNodeParameter('chatSubject', i, '') as string;
	const transcript = context.getNodeParameter('chatTranscript', i, '') as string;
	if (finished) requireValue(context, i, transcript, 'Transcript Message');
	else requireValue(context, i, subject, 'Chat Subject');
	return {
		chat_subject: subject,
		cf_chat_status: context.getNodeParameter('chatStatus', i) as string,
		...(finished ? { cf_chat_transcript_message: transcript } : {}),
	};
}

// Ligação: número de origem e resultado são obrigatórios.
function callFields(context: IExecuteFunctions, i: number): IDataObject {
	const from = context.getNodeParameter('callFromNumber', i, '') as string;
	const status = context.getNodeParameter('callStatus', i, '') as string;
	requireValue(context, i, from, 'Call From Number');
	requireValue(context, i, status, 'Call Status');
	return { call_from_number: from, call_status: status };
}

// Mídia: tipo e identificador são obrigatórios.
function mediaFields(context: IExecuteFunctions, i: number): IDataObject {
	const identifier = context.getNodeParameter('mediaIdentifier', i, '') as string;
	requireValue(context, i, identifier, 'Media Identifier');
	return {
		media_type: context.getNodeParameter('mediaType', i) as string,
		media_identifier: identifier,
	};
}

// Atalho para as operações da lista de operações abaixo.
const op = (name: string, value: string, action: string, description: string) => ({
	name,
	value,
	action,
	description,
});

export const eventResource: ResourceModule = {
	value: 'event',
	name: 'Event',
	operationSelector: operationSelector(
		'event',
		[
			op('Mark Lost Opportunity', 'markLostOpportunity', 'Mark a lost opportunity', 'Mark that an opportunity was lost'),
			op('Mark Opportunity', 'markOpportunity', 'Mark an opportunity', 'Mark a contact as an opportunity'),
			op('Mark Sale', 'markSale', 'Mark a sale', 'Mark that an opportunity became a sale'),
			op('Send Batch', 'sendBatch', 'Send a batch of events', 'Send many events in one request'),
			op('Send Call Finished', 'sendCallFinished', 'Send a call finished event', 'Register a finished call'),
			op('Send Chat Event', 'sendChatEvent', 'Send a chat event', 'Register the start or the end of a chat'),
			op('Send Conversion', 'sendConversion', 'Send a conversion', 'Register a conversion and create or update the contact'),
			op('Send Custom Event', 'sendCustomEvent', 'Send an e-commerce event', 'Send an e-commerce event with a JSON payload'),
			op('Send Media Event', 'sendMediaEvent', 'Send a media event', 'Register the start or the end of an audio or video playback'),
		],
		'sendConversion',
	),
	properties,
	handlers: {
		sendConversion,
		markOpportunity: eventOperation({
			eventType: () => 'OPPORTUNITY',
			fields: [PHONE_FIELD],
			build: () => FUNNEL,
		}),
		markSale: eventOperation({
			eventType: () => 'SALE',
			fields: [PHONE_FIELD],
			build: saleFields,
		}),
		markLostOpportunity: eventOperation({
			eventType: () => 'OPPORTUNITY_LOST',
			fields: [PHONE_FIELD],
			build: lostFields,
		}),
		sendChatEvent: eventOperation({
			eventType: (context, i) =>
				context.getNodeParameter('chatEvent', i) === 'Finished' ? 'CHAT_FINISHED' : 'CHAT_STARTED',
			fields: [PHONE_FIELD, NAME_FIELD],
			build: chatFields,
		}),
		sendCallFinished: eventOperation({
			eventType: () => 'CALL_FINISHED',
			fields: CALL_FIELDS,
			build: callFields,
		}),
		sendMediaEvent: eventOperation({
			eventType: (context, i) =>
				context.getNodeParameter('mediaEvent', i) === 'Stopped'
					? 'MEDIA_PLAYBACK_STOPPED'
					: 'MEDIA_PLAYBACK_STARTED',
			fields: MEDIA_FIELDS,
			build: mediaFields,
		}),
		sendCustomEvent,
		sendBatch,
	},
};
