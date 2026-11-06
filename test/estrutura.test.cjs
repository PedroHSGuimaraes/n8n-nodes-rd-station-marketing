/**
 * Testes de estrutura do pacote (checks C1, C3, C5 a C8, C91, C92, C95, C111 e C112).
 *
 * Eles leem o `package.json`, os workflows, o `dist/` gerado pelo build e os descritores dos nodes.
 * Servem de rede de proteção para o que o n8n e o npm esperam do pacote: nomes persistidos nos
 * workflows, arquivos publicados e o comentário de cabeçalho exigido pela regra da casa.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const raiz = path.join(__dirname, '..');
const ler = (...partes) => fs.readFileSync(path.join(raiz, ...partes), 'utf8');
const pacote = JSON.parse(ler('package.json'));

// Lista todos os arquivos `.ts` de uma pasta, para a regra do comentário de cabeçalho.
function arquivosTs(pasta) {
	const completo = path.join(raiz, pasta);
	if (!fs.existsSync(completo)) return [];
	return fs.readdirSync(completo, { withFileTypes: true }).flatMap((entrada) => {
		const relativo = path.join(pasta, entrada.name);
		if (entrada.isDirectory()) return arquivosTs(relativo);
		return entrada.name.endsWith('.ts') ? [relativo] : [];
	});
}

// Devolve os arquivos `.ts` que não abrem com um bloco de comentário `/**`.
function semCabecalho(arquivos, leitor) {
	return arquivos.filter((arquivo) => !leitor(arquivo).trimStart().startsWith('/**'));
}

describe('Pacote', () => {
	it('C1 - o build gera os nodes, as credenciais e os ícones svg em dist/', () => {
		const dist = (...p) => fs.existsSync(path.join(raiz, 'dist', ...p));
		assert.ok(dist('nodes', 'RdStationMarketing', 'RdStationMarketing.node.js'));
		assert.ok(dist('nodes', 'RdStationMarketingTrigger', 'RdStationMarketingTrigger.node.js'));
		assert.ok(dist('credentials', 'RdStationMarketingOAuth2Api.credentials.js'));
		assert.ok(dist('credentials', 'RdStationMarketingApi.credentials.js'));
		for (const node of ['RdStationMarketing', 'RdStationMarketingTrigger']) {
			assert.ok(dist('nodes', node, 'rdStationMarketing.svg'), `${node} sem ícone claro`);
			assert.ok(dist('nodes', node, 'rdStationMarketing.dark.svg'), `${node} sem ícone escuro`);
		}
	});

	it('C3 - o package.json traz os campos do plano e nenhum dependencies', () => {
		assert.equal(pacote.name, '@pexuleco/n8n-nodes-rd-station-marketing');
		assert.equal(pacote.version, '1.0.1');
		assert.equal(pacote.license, 'MIT');
		assert.ok(pacote.keywords.includes('n8n-community-node-package'));
		assert.equal(pacote.scripts.build, 'n8n-node build');
		assert.equal(pacote.scripts.lint, 'n8n-node lint');
		assert.equal(pacote.n8n.strict, true);
		assert.equal(pacote.devDependencies['@n8n/node-cli'], '0.55.5');
		assert.equal(pacote.n8n.nodes.length, 2);
		assert.equal(pacote.n8n.credentials.length, 2);
		assert.equal('dependencies' in pacote, false);
	});

	it('C5 - o workflow de CI roda npm ci, lint, test e build no Pull Request', () => {
		const ci = ler('.github', 'workflows', 'ci.yml');
		assert.match(ci, /pull_request:/);
		for (const comando of ['npm ci', 'npm run lint', 'npm test', 'npm run build']) {
			assert.ok(ci.includes(`run: ${comando}`), `CI sem "${comando}"`);
		}
	});

	it('C6 - o workflow de publicação confere a tag, roda lint, test e build e publica', () => {
		const publicar = ler('.github', 'workflows', 'publish.yml');
		assert.match(publicar, /tags:\s*\n\s*- 'v\*\.\*\.\*'/);
		assert.match(publicar, /GITHUB_REF_NAME.*v\$\{PACKAGE_VERSION\}/);
		for (const comando of ['npm run lint', 'npm test', 'npm run build']) {
			assert.ok(publicar.includes(`run: ${comando}`), `publish sem "${comando}"`);
		}
		// Desde o token stage only (06/11/2026) a publicação é o `npm stage publish` (check C110),
		// e não mais o `npm run release`, que falharia com E_STAGE_REQUIRED.
		assert.ok(publicar.includes('stage publish'), 'publish sem "stage publish"');
		assert.match(publicar, /id-token: write/);
		assert.equal(pacote.publishConfig.provenance, true);
	});

	it('C7 - todo .ts de nodes/ e credentials/ abre com bloco /** (e o detector acusa o que não abre)', () => {
		// O detector tem de nomear o arquivo que abre com `import`; sem isso o teste não protegeria nada.
		const falso = { 'a.ts': "import x from 'y';", 'b.ts': '/** cabeçalho */\nimport x from "y";' };
		assert.deepEqual(
			semCabecalho(['a.ts', 'b.ts'], (a) => falso[a]),
			['a.ts'],
		);
		const reais = [...arquivosTs('nodes'), ...arquivosTs('credentials')];
		assert.ok(reais.length > 0, 'nenhum .ts encontrado');
		assert.deepEqual(
			semCabecalho(reais, (a) => ler(a)),
			[],
		);
	});

	it('C8 - o README está em PT-BR com as 5 seções e o CHANGELOG tem a seção 1.0.0', () => {
		const readme = ler('README.md');
		for (const secao of [
			'Instalação',
			'Credenciais',
			'Recursos e Operações',
			'Exemplos',
			'Desenvolvimento',
		]) {
			assert.match(readme, new RegExp(`^## (\\S+ )?${secao}`, 'm'), `README sem a seção ${secao}`);
		}
		assert.match(ler('CHANGELOG.md'), /^## 1\.0\.0/m);
		assert.match(ler('CHANGELOG.md'), /^## 1\.0\.1/m);
	});
});

describe('Descritores', () => {
	const {
		RdStationMarketing,
	} = require('../dist/nodes/RdStationMarketing/RdStationMarketing.node');
	const {
		RdStationMarketingTrigger,
	} = require('../dist/nodes/RdStationMarketingTrigger/RdStationMarketingTrigger.node');

	it('C91 - os nodes mantêm os nomes e os parâmetros que ficam salvos nos workflows', () => {
		const acao = new RdStationMarketing().description;
		const gatilho = new RdStationMarketingTrigger().description;
		assert.equal(acao.name, 'rdStationMarketing');
		assert.equal(gatilho.name, 'rdStationMarketingTrigger');
		assert.equal(acao.version, 1);
		assert.equal(gatilho.version, 1);
		const nomes = acao.properties.map((p) => p.name);
		for (const nome of ['resource', 'operation', 'authentication', 'returnAll', 'limit']) {
			assert.ok(nomes.includes(nome), `falta o parâmetro ${nome}`);
		}
	});

	it('C92 - todo ID com rota de listagem é resourceLocator com list (padrão, searchable) e id', () => {
		const ids = [
			'customFieldId',
			'segmentationId',
			'workflowId',
			'emailId',
			'campaignId',
			'catalogId',
			'webhookId',
		];
		const propriedades = new RdStationMarketing().description.properties;
		for (const id of ids) {
			const achadas = propriedades.filter((p) => p.name === id);
			assert.ok(achadas.length > 0, `falta o parâmetro ${id}`);
			for (const p of achadas) {
				assert.equal(p.type, 'resourceLocator', `${id} não é resourceLocator`);
				assert.equal(p.default.mode, 'list', `${id} não abre em From list`);
				const lista = p.modes.find((m) => m.name === 'list');
				assert.equal(lista.typeOptions.searchable, true, `${id} sem busca`);
				assert.ok(
					p.modes.some((m) => m.name === 'id'),
					`${id} sem modo id`,
				);
			}
		}
	});

	it('C95 - o gatilho declara o webhook POST no caminho webhook e responde na hora', () => {
		const [webhook] = new RdStationMarketingTrigger().description.webhooks;
		assert.equal(webhook.httpMethod, 'POST');
		assert.equal(webhook.path, 'webhook');
		assert.equal(webhook.responseMode, 'onReceived');
	});

	// C111: o npm recusou o nome sem escopo (E400 "Version uniqueness check failed unexpectedly", runs
	// 42287807746 e 42288009373) porque `n8n-nodes-rdstation-marketing` já existe e, sem pontuação,
	// os dois nomes ficam iguais. Este teste falha se alguém voltar ao nome sem escopo, tirar o
	// acesso público (pacote com escopo nasce privado) ou esquecer o nome novo na instrução do README.
	it('C111 - o pacote tem escopo @pexuleco, acesso público e o README instala pelo nome novo', () => {
		const nome = '@pexuleco/n8n-nodes-rd-station-marketing';
		assert.equal(pacote.name, nome);
		assert.equal(pacote.publishConfig.access, 'public');
		// A instrução de instalação é o bloco de código logo depois do título "Instalação".
		const instalacao = ler('README.md').split(/^## (?:\S+ )?Instalação/m)[1].split('##')[0];
		assert.ok(instalacao.includes('\n' + nome + '\n'), 'README sem o nome com escopo na instalação');
		// O CHANGELOG da 1.0.0 também cita o pacote pelo nome publicado, para quem lê o histórico.
		assert.ok(ler('CHANGELOG.md').includes('`' + nome + '`'), 'CHANGELOG sem o nome com escopo');
	});

	// C112: o dono pediu (06/11/2026) "sempre postar com documentação completa igual do rd crm". Este
	// teste falha se o README perder uma seção do padrão do README do RD CRM ou se o `package.json`
	// perder o `funding` (o link do Buy Me a Coffee que o `npm fund` mostra).
	it('C112 - o README tem as seções do padrão do RD CRM e o package.json tem funding', () => {
		const readme = ler('README.md');
		for (const secao of [
			'Funcionalidades',
			'Instalação',
			'Credenciais',
			'Recursos e Operações',
			'Gatilho',
			'Usar como Tool de Agente de IA',
			'Desenvolvimento',
			'Compatibilidade',
			'Recursos',
			'Publicação',
			'Versões',
			'Suporte',
			'Apoie o projeto',
			'Licença',
		]) {
			assert.match(readme, new RegExp(`^## \\S+ ${secao}$`, 'm'), `README sem a seção ${secao}`);
		}
		// A seção de IA traz a variável que liga a tool e o `$fromAI` com operação real do pacote.
		assert.match(readme, /N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true/);
		assert.match(readme, /\$fromAI\(/);
		// O selo e o link de apoio apontam para o mesmo Buy Me a Coffee do `funding`.
		assert.deepEqual(pacote.funding, { type: 'individual', url: 'https://buymeacoffee.com/qTny0AzFXS' });
		assert.ok(readme.includes(pacote.funding.url), 'README sem o link de apoio');
		// A seção Versões lista toda versão que o CHANGELOG tem.
		for (const [, versao] of ler('CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+)/gm)) {
			assert.ok(readme.includes('**' + versao + '**'), `README sem a versão ${versao} em Versões`);
		}
	});
});
