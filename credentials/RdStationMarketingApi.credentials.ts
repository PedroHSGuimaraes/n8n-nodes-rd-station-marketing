/**
 * Credencial de chave de API do RD Station Marketing.
 *
 * A RD aceita chave de API só em `POST /platform/conversions` (evento de conversão). Todas as outras
 * rotas pedem OAuth2. Por isso esta credencial só aparece no node de ação quando a operação é
 * Send Conversion e a autenticação escolhida é a chave de API.
 */
import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class RdStationMarketingApi implements ICredentialType {
	// Nome persistido nos workflows salvos: não pode mudar depois do lançamento (porta de uma via).
	name = 'rdStationMarketingApi';

	displayName = 'RD Station Marketing API';

	documentationUrl = 'https://developers.rdstation.com/reference/autenticacao-api-key';

	icon = { light: 'file:rdStationMarketing.svg', dark: 'file:rdStationMarketing.dark.svg' } as const;

	properties: INodeProperties[] = [
		{
			// A chave é segredo: o n8n a esconde na tela e a guarda criptografada.
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Generated in the RD Station App Store under "Generate API key"',
		},
	];

	// A RD lê a chave na query string (`api_key`) e não aceita o cabeçalho Authorization nesta rota.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			qs: {
				api_key: '={{$credentials.apiKey}}',
			},
		},
	};

	// A chave só funciona em POST /platform/conversions, então o teste manda uma conversão sem e-mail
	// nem telefone: com chave válida a RD recusa o corpo (400) e nada é criado; com chave inválida
	// ela responde 401 ou 403. `ignoreHttpStatusErrors` deixa o 400 passar e as regras abaixo
	// reprovam só os dois status de chave inválida.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.rd.services',
			url: '/platform/conversions',
			method: 'POST',
			body: { event_type: 'CONVERSION', event_family: 'CDP', payload: {} },
			ignoreHttpStatusErrors: true,
		},
		rules: [
			{
				type: 'responseCode',
				properties: { value: 401, message: 'The API key is invalid' },
			},
			{
				type: 'responseCode',
				properties: { value: 403, message: 'The API key is disabled or has no access' },
			},
		],
	};
}
