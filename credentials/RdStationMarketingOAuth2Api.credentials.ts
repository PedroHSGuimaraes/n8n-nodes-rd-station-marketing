/**
 * Credencial OAuth2 do RD Station Marketing.
 *
 * Serve todas as operações do node de ação e o gatilho. Estende a credencial `oAuth2Api` do n8n,
 * que já traz o botão de login, a troca do código pelo token e a renovação. Só fixamos aqui os
 * valores da RD: a pessoa informa apenas o Client ID e o Client Secret criados na App Store da RD.
 */
import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class RdStationMarketingOAuth2Api implements ICredentialType {
	// Nome persistido nos workflows salvos: não pode mudar depois do lançamento (porta de uma via).
	name = 'rdStationMarketingOAuth2Api';

	// Reaproveita o fluxo OAuth2 do n8n em vez de reescrever login e renovação.
	extends = ['oAuth2Api'];

	displayName = 'RD Station Marketing OAuth2 API';

	documentationUrl = 'https://developers.rdstation.com/reference/autentica%C3%A7%C3%A3o';

	icon = { light: 'file:rdStationMarketing.svg', dark: 'file:rdStationMarketing.dark.svg' } as const;

	// Campos escondidos: a RD tem um único endereço de login e de token, então a pessoa não os edita.
	properties: INodeProperties[] = [
		{
			// A RD usa o fluxo "authorization code": o usuário loga no navegador e volta com um código.
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			// Página de login e autorização da RD (passo 2 da documentação oficial).
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://api.rd.services/auth/dialog',
		},
		{
			// `token_by=code` é o formato que a RD exige para trocar o código pelo token.
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://api.rd.services/auth/token?token_by=code',
		},
		{
			// A página de autorização da RD não pede `scope`.
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			// A RD espera client_id e client_secret no corpo JSON, e não em Basic Auth.
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];

	// Lista os campos de contato: rota leve, aberta a qualquer conta e que prova que o token vale.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.rd.services',
			url: '/platform/contacts/fields',
		},
	};
}
