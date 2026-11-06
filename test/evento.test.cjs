/**
 * Testes do recurso Event (checks C12, C13 e C61 a C74): conversão, qualificação, chat, ligação,
 * mídia, evento personalizado de e-commerce e envio em lote.
 *
 * Todos os eventos saem em `POST /platform/events` com `event_family: "CDP"`; muda o `event_type` e
 * o `payload`. Os testes travam o contrato campo a campo, porque a RD recusa o evento inteiro quando
 * falta um campo obrigatório e só devolve o erro depois da ida à rede.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { executarJson } = require('./contexto.cjs');

const conversao = {
	resource: 'event',
	operation: 'sendConversion',
	conversionIdentifier: 'newsletter',
	email: 'ana@example.com',
};
const semChamada = () => {
	throw new Error('não devia chamar a RD');
};

describe('Seletor de autenticação', () => {
	it('C12 - Send Conversion usa a chave de API em /platform/conversions e OAuth2 em /platform/events', async () => {
		const porChave = await executarJson({ ...conversao, authentication: 'apiKey' }, () => ({
			event_uuid: 'e-1',
		}));
		assert.equal(porChave.requisicoes[0].tipoCredencial, 'rdStationMarketingApi');
		assert.equal(porChave.requisicoes[0].url, '/platform/conversions');
		assert.equal(porChave.requisicoes[0].headers.Authorization, undefined);

		const porOauth = await executarJson({ ...conversao, authentication: 'oAuth2' }, () => ({
			event_uuid: 'e-2',
		}));
		assert.equal(porOauth.requisicoes[0].tipoCredencial, 'rdStationMarketingOAuth2Api');
		assert.equal(porOauth.requisicoes[0].url, '/platform/events');
	});

	it('C13 - o seletor authentication só aparece em Send Conversion', () => {
		const { RdStationMarketing } = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
		const seletor = new RdStationMarketing().description.properties.find(
			(p) => p.name === 'authentication',
		);
		assert.deepEqual(seletor.displayOptions.show.resource, ['event']);
		assert.deepEqual(seletor.displayOptions.show.operation, ['sendConversion']);
		assert.equal(seletor.default, 'oAuth2');
	});
});

describe('Event', () => {
	it('C61 - Send Conversion envia CONVERSION, CDP e o payload, e devolve event_uuid', async () => {
		const { json, requisicoes } = await executarJson(conversao, () => ({ event_uuid: 'e-1' }));
		assert.equal(requisicoes[0].method, 'POST');
		assert.deepEqual(requisicoes[0].body, {
			event_type: 'CONVERSION',
			event_family: 'CDP',
			payload: { conversion_identifier: 'newsletter', email: 'ana@example.com' },
		});
		assert.deepEqual(json, [{ event_uuid: 'e-1' }]);
	});

	it('C62 - Send Conversion sem e-mail e sem telefone lança o erro do plano sem chamar a RD', async () => {
		await assert.rejects(executarJson({ ...conversao, email: '' }, semChamada), (erro) => {
			assert.equal(erro.message, 'Provide an email or a phone [item 0]');
			return true;
		});
	});

	it('C63 - o campo personalizado cf_plano entra dentro do payload', async () => {
		const { requisicoes } = await executarJson(
			{ ...conversao, customFields: { values: [{ field: 'cf_plano', value: 'Pro' }] } },
			() => ({ event_uuid: 'e-1' }),
		);
		assert.equal(requisicoes[0].body.payload.cf_plano, 'Pro');
		assert.equal('cf_plano' in requisicoes[0].body, false);
	});

	it('C64 - Mark Opportunity envia OPPORTUNITY com funnel_name default', async () => {
		const { requisicoes } = await executarJson(
			{ resource: 'event', operation: 'markOpportunity', email: 'ana@example.com' },
			() => ({ event_uuid: 'e-1' }),
		);
		assert.equal(requisicoes[0].body.event_type, 'OPPORTUNITY');
		assert.deepEqual(requisicoes[0].body.payload, { email: 'ana@example.com', funnel_name: 'default' });
	});

	it('C65 - Mark Sale envia SALE com value 1500 e omite o value vazio', async () => {
		const base = { resource: 'event', operation: 'markSale', email: 'ana@example.com' };
		const comValor = await executarJson({ ...base, value: 1500 }, () => ({ event_uuid: 'e-1' }));
		assert.equal(comValor.requisicoes[0].body.event_type, 'SALE');
		assert.equal(comValor.requisicoes[0].body.payload.value, 1500);
		const semValor = await executarJson({ ...base, value: '' }, () => ({ event_uuid: 'e-2' }));
		assert.equal('value' in semValor.requisicoes[0].body.payload, false);
	});

	it('C66 - Mark Lost Opportunity envia OPPORTUNITY_LOST com o motivo', async () => {
		const { requisicoes } = await executarJson(
			{ resource: 'event', operation: 'markLostOpportunity', email: 'ana@example.com', reason: 'Sem orçamento' },
			() => ({ event_uuid: 'e-1' }),
		);
		assert.equal(requisicoes[0].body.event_type, 'OPPORTUNITY_LOST');
		assert.equal(requisicoes[0].body.payload.reason, 'Sem orçamento');
	});

	it("C67 - motivo vazio lança \"The 'Reason' parameter is empty [item 0]\" sem chamar a RD", async () => {
		await assert.rejects(
			executarJson(
				{ resource: 'event', operation: 'markLostOpportunity', email: 'ana@example.com', reason: '' },
				semChamada,
			),
			(erro) => {
				assert.equal(erro.message, "The 'Reason' parameter is empty [item 0]");
				return true;
			},
		);
	});

	it('C68 - Chat Started envia CHAT_STARTED com assunto e status; Finished exige a transcrição', async () => {
		const base = { resource: 'event', operation: 'sendChatEvent', email: 'ana@example.com' };
		const iniciado = await executarJson(
			{ ...base, chatEvent: 'Started', chatSubject: 'Dúvida', chatStatus: 'online' },
			() => ({ event_uuid: 'e-1' }),
		);
		assert.equal(iniciado.requisicoes[0].body.event_type, 'CHAT_STARTED');
		assert.equal(iniciado.requisicoes[0].body.payload.chat_subject, 'Dúvida');
		assert.equal(iniciado.requisicoes[0].body.payload.cf_chat_status, 'online');

		const terminado = await executarJson(
			{ ...base, chatEvent: 'Finished', chatStatus: 'online', chatTranscript: 'Olá! Até logo.' },
			() => ({ event_uuid: 'e-2' }),
		);
		assert.equal(terminado.requisicoes[0].body.event_type, 'CHAT_FINISHED');
		assert.equal(terminado.requisicoes[0].body.payload.cf_chat_transcript_message, 'Olá! Até logo.');

		await assert.rejects(
			executarJson({ ...base, chatEvent: 'Finished', chatStatus: 'online', chatTranscript: '' }, semChamada),
			/The 'Transcript Message' parameter is empty \[item 0\]/,
		);
	});

	it('C69 - Send Call Finished envia CALL_FINISHED com número e status', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'event',
				operation: 'sendCallFinished',
				email: 'ana@example.com',
				callFromNumber: '+5511987654321',
				callStatus: 'answered',
			},
			() => ({ event_uuid: 'e-1' }),
		);
		assert.equal(requisicoes[0].body.event_type, 'CALL_FINISHED');
		assert.equal(requisicoes[0].body.payload.call_from_number, '+5511987654321');
		assert.equal(requisicoes[0].body.payload.call_status, 'answered');
	});

	it('C70 - Send Media Event com Stopped envia MEDIA_PLAYBACK_STOPPED com tipo e identificador', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'event',
				operation: 'sendMediaEvent',
				email: 'ana@example.com',
				mediaEvent: 'Stopped',
				mediaType: 'Vídeo',
				mediaIdentifier: 'aula-01',
			},
			() => ({ event_uuid: 'e-1' }),
		);
		assert.equal(requisicoes[0].body.event_type, 'MEDIA_PLAYBACK_STOPPED');
		assert.equal(requisicoes[0].body.payload.media_type, 'Vídeo');
		assert.equal(requisicoes[0].body.payload.media_identifier, 'aula-01');
	});

	it('C71 - Send Custom Event envia o tipo e o payload, e o dropdown tem os 8 ECOMMERCE_*', async () => {
		const { requisicoes } = await executarJson(
			{
				resource: 'event',
				operation: 'sendCustomEvent',
				eventType: 'ECOMMERCE_ORDER_PLACED',
				payload: '{"email":"ana@example.com","identifier":"p-1","currency":"BRL","price":10,"total_items":1}',
			},
			() => ({ event_uuid: 'e-1' }),
		);
		assert.equal(requisicoes[0].body.event_type, 'ECOMMERCE_ORDER_PLACED');
		assert.equal(requisicoes[0].body.event_family, 'CDP');
		assert.equal(requisicoes[0].body.payload.identifier, 'p-1');

		const { RdStationMarketing } = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
		const dropdown = new RdStationMarketing().description.properties.find(
			(p) => p.name === 'eventType' && p.displayOptions?.show?.resource?.includes('event'),
		);
		const valores = dropdown.options.map((o) => o.value).sort();
		assert.equal(valores.length, 8);
		assert.ok(valores.every((v) => v.startsWith('ECOMMERCE_')));
		for (const descontinuado of ['ORDER_PLACED', 'ORDER_PLACED_ITEM', 'CART_ABANDONED', 'CART_ABANDONED_ITEM']) {
			assert.equal(valores.includes(descontinuado), false);
		}
	});

	const evento = (n) => ({
		event_type: 'CONVERSION',
		event_family: 'CDP',
		payload: { conversion_identifier: `c${n}`, email: `a${n}@example.com` },
	});

	it('C72 - Send Batch chama POST /platform/events/batch com os 3 eventos e devolve o lote', async () => {
		const lote = [evento(1), evento(2), evento(3)];
		const resposta = { event_batch_uuid: 'b-1', events: [{ event_uuid: 'e1' }, { event_uuid: 'e2' }, { event_uuid: 'e3' }] };
		const { json, requisicoes } = await executarJson(
			{ resource: 'event', operation: 'sendBatch', events: JSON.stringify(lote) },
			() => resposta,
		);
		assert.equal(requisicoes[0].url, '/platform/events/batch');
		assert.deepEqual(requisicoes[0].body, lote);
		assert.deepEqual(json, [resposta]);
	});

	it('C73 - lote acima de 200000 bytes lança o erro do plano sem chamar a RD', async () => {
		const grande = Array.from({ length: 2000 }, (_, n) => ({
			...evento(n),
			payload: { ...evento(n).payload, bio: 'x'.repeat(120) },
		}));
		await assert.rejects(
			executarJson({ resource: 'event', operation: 'sendBatch', events: JSON.stringify(grande) }, semChamada),
			(erro) => {
				assert.equal(erro.message, 'The batch is larger than 0.2 MB [item 0]');
				assert.equal(erro.description, 'Split the events into smaller batches');
				return true;
			},
		);
	});

	it("C74 - JSON inválido em Custom Event e Batch lança \"The 'Payload' parameter is not valid JSON [item 0]\"", async () => {
		await assert.rejects(
			executarJson(
				{ resource: 'event', operation: 'sendCustomEvent', eventType: 'ECOMMERCE_ORDER_PAID', payload: '{nao e json' },
				semChamada,
			),
			(erro) => {
				assert.equal(erro.message, "The 'Payload' parameter is not valid JSON [item 0]");
				return true;
			},
		);
		await assert.rejects(
			executarJson({ resource: 'event', operation: 'sendBatch', events: '[{' }, semChamada),
			/The 'Payload' parameter is not valid JSON \[item 0\]/,
		);
	});
});
