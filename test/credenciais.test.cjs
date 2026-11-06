/**
 * Testes das credenciais (checks C9, C10 e C94) e do roteamento entre elas (C12 e C13).
 *
 * Valem o contrato com a RD: o fluxo OAuth2 com client id e secret no corpo e a chave de API que
 * viaja na query só para a conversão. Uma troca de URL ou de método de autenticação quebraria o
 * login de quem já usa o pacote, por isso cada valor do plano tem uma asserção própria.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
	RdStationMarketingOAuth2Api,
} = require('../dist/credentials/RdStationMarketingOAuth2Api.credentials');
const { RdStationMarketingApi } = require('../dist/credentials/RdStationMarketingApi.credentials');
const { executarJson } = require('./contexto.cjs');

// Lê o valor padrão de uma propriedade da credencial pelo nome.
const padrao = (credencial, nome) => credencial.properties.find((p) => p.name === nome)?.default;

describe('Credenciais', () => {
	it('C9 - OAuth2 estende oAuth2Api com authorizationCode, as duas URLs e body', () => {
		const credencial = new RdStationMarketingOAuth2Api();
		assert.equal(credencial.name, 'rdStationMarketingOAuth2Api');
		assert.deepEqual(credencial.extends, ['oAuth2Api']);
		assert.equal(padrao(credencial, 'grantType'), 'authorizationCode');
		assert.equal(padrao(credencial, 'authUrl'), 'https://api.rd.services/auth/dialog');
		assert.equal(
			padrao(credencial, 'accessTokenUrl'),
			'https://api.rd.services/auth/token?token_by=code',
		);
		assert.equal(padrao(credencial, 'authentication'), 'body');
	});

	it('C10 - a chave de API tem apiKey com typeOptions.password e vai na query', () => {
		const credencial = new RdStationMarketingApi();
		assert.equal(credencial.name, 'rdStationMarketingApi');
		const campo = credencial.properties.find((p) => p.name === 'apiKey');
		assert.equal(campo.typeOptions.password, true);
		assert.equal(credencial.authenticate.properties.qs.api_key, '={{$credentials.apiKey}}');
		assert.equal(credencial.authenticate.properties.headers, undefined);
	});

	it('C94 - o teste da credencial chama GET /platform/contacts/fields na base da RD', () => {
		const { request } = new RdStationMarketingOAuth2Api().test;
		assert.equal(request.baseURL, 'https://api.rd.services');
		assert.equal(request.url, '/platform/contacts/fields');
	});
});
