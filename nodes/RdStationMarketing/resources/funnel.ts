/**
 * Recurso Funnel: ler e mudar o estágio, a oportunidade e o dono de um contato no funil padrão.
 *
 * A RD só tem o funil `default`, então o caminho é sempre `.../funnels/default`. O contato é
 * achado por uuid, e-mail ou telefone, como no recurso Contact.
 */
import type { IDataObject, INodeProperties } from 'n8n-workflow';

import type { OperationHandler, ResourceModule } from '../descriptions';
import { operationSelector, showFor } from '../descriptions';
import { contactPath, isEmpty, requireValue } from '../helpers';
import { rdMarketingApiRequest } from '../transport';

const properties: INodeProperties[] = [
	{
		// Tipo do identificador que vai no caminho da URL.
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
		displayOptions: showFor('funnel', ['get', 'update']),
	},
	{
		// Valor do identificador do contato.
		displayName: 'Identifier',
		name: 'identifier',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. name@email.com',
		description: 'Email, phone (E.164 format) or UUID of the contact, as chosen in Identifier Type',
		displayOptions: showFor('funnel', ['get', 'update']),
	},
	{
		// Só o que a pessoa preencher vai para a RD; o PUT deixa o resto como está.
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor('funnel', ['update']),
		options: [
			{
				// Dono do contato; a RD valida se o e-mail é de um usuário da conta (erro INVALID_USER).
				displayName: 'Contact Owner Email',
				name: 'contactOwnerEmail',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Email of the RD Station user who owns the contact',
			},
			{
				// Estágio no funil; a RD aceita só estes três valores.
				displayName: 'Lifecycle Stage',
				name: 'lifecycleStage',
				type: 'options',
				options: [
					{ name: 'Client', value: 'Client' },
					{ name: 'Lead', value: 'Lead' },
					{ name: 'Qualified Lead', value: 'Qualified Lead' },
				],
				default: 'Lead',
				description: 'Stage of the contact in the default funnel',
			},
			{
				displayName: 'Opportunity',
				name: 'opportunity',
				type: 'boolean',
				default: false,
				description: 'Whether the contact is marked as an opportunity',
			},
			{
				// A RD desassocia o dono quando recebe `null`; um campo próprio evita mandar vazio por engano.
				displayName: 'Remove Contact Owner',
				name: 'removeContactOwner',
				type: 'boolean',
				default: false,
				description: 'Whether to remove the owner of the contact',
			},
		],
	},
];

// Funnel → Get: devolve estágio, oportunidade, dono, fit e interesse do contato.
const get: OperationHandler = async function (i) {
	const type = this.getNodeParameter('identifierType', i) as string;
	const identifier = this.getNodeParameter('identifier', i) as string;
	// Sem identificador a rota seria inválida; avisar antes poupa a ida à rede.
	requireValue(this, i, identifier, 'Identifier');
	return rdMarketingApiRequest.call(this, 'GET', `${contactPath(type, identifier)}/funnels/default`, {
		itemIndex: i,
	});
};

// Funnel → Update: monta o corpo só com o que foi preenchido.
const update: OperationHandler = async function (i) {
	const type = this.getNodeParameter('identifierType', i) as string;
	const identifier = this.getNodeParameter('identifier', i) as string;
	requireValue(this, i, identifier, 'Identifier');
	const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
	const body: IDataObject = {};
	// Estágio e oportunidade entram quando a pessoa os escolheu (`false` também é uma escolha).
	if (fields.lifecycleStage !== undefined) body.lifecycle_stage = fields.lifecycleStage;
	if (fields.opportunity !== undefined) body.opportunity = fields.opportunity;
	if (fields.removeContactOwner === true) {
		// `null` é o jeito documentado de a RD desassociar o dono.
		body.contact_owner_email = null;
	} else if (!isEmpty(fields.contactOwnerEmail)) {
		// Dono novo; campo vazio é omitido para não apagar o dono atual.
		body.contact_owner_email = fields.contactOwnerEmail;
	}
	return rdMarketingApiRequest.call(this, 'PUT', `${contactPath(type, identifier)}/funnels/default`, {
		body,
		itemIndex: i,
	});
};

export const funnelResource: ResourceModule = {
	value: 'funnel',
	name: 'Funnel',
	operationSelector: operationSelector(
		'funnel',
		[
			{
				name: 'Get',
				value: 'get',
				action: 'Get the funnel of a contact',
				description: 'Get the stage, opportunity and owner of a contact in the default funnel',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update the funnel of a contact',
				description: 'Change the stage, opportunity or owner of a contact in the default funnel',
			},
		],
		'get',
	),
	properties,
	handlers: { get, update },
};
