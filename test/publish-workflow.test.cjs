/**
 * Teste do workflow de publicação (check C110).
 *
 * O token NPM_TOKEN é granular "Read and write (stage only)" (decisão do dono, 06/11/2026): com ele
 * `npm publish` e `npm run release` falham com E_STAGE_REQUIRED. A versão precisa ir para a fila do
 * `npm stage publish`, que só existe no npm 12 (o Node LTS do runner traz o npm 11). O dono aprova
 * cada versão com 2FA na aba Staged Packages do npmjs.com. Estes testes leem o texto do yml, sem
 * dependência de parser YAML, e falham se o workflow voltar a publicar direto.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const workflows = path.resolve(__dirname, '..', '.github', 'workflows');
const read = (file) => fs.readFileSync(path.join(workflows, file), 'utf8');

// Linhas `run:` de verdade; comentário que cita o comando não conta.
const runLines = (text) => text.split('\n').filter((line) => /^\s*(-\s+)?run:/.test(line));

// Lê o valor de `node-version` do workflow, sem aspas, para comparar publish e ci.
const nodeVersion = (text) => {
	const found = text.match(/^\s*node-version:\s*['"]?([^'"\n]+)['"]?\s*$/m);
	return found ? found[1].trim() : undefined;
};

describe('publish workflow', () => {
	it('C110 - stages the package with npm 12 instead of publishing it', () => {
		const publish = read('publish.yml');
		const runs = runLines(publish);
		// O passo de publicação usa o `npm stage publish` do npm 12, com proveniência.
		assert.ok(
			runs.some((l) => l.includes('npm@12.2.2 stage publish') && l.includes('--provenance')),
			'publish.yml must run "npx -y npm@12.2.2 stage publish --provenance"',
		);
		// Com token stage only, publicar direto falha; nenhum passo pode chamar esses comandos.
		assert.equal(runs.some((l) => /\bnpm publish\b/.test(l)), false, 'no "npm publish" step');
		assert.equal(runs.some((l) => /\bnpm run release\b/.test(l)), false, 'no "npm run release" step');
	});

	it('C110 - the stage step has RELEASE_MODE and NODE_AUTH_TOKEN in its env', () => {
		const lines = read('publish.yml').split('\n');
		const at = lines.findIndex((l) => /^\s*(-\s+)?run:.*stage publish/.test(l));
		assert.notEqual(at, -1, 'stage publish step not found');
		// O passo termina na próxima linha de início de passo (`- name:` ou `- uses:`).
		const rest = lines.slice(at + 1);
		const end = rest.findIndex((l) => /^\s*-\s+(name|uses):/.test(l));
		const block = (end === -1 ? rest : rest.slice(0, end)).join('\n');
		// `prepublishOnly` roda `n8n-node prerelease`, que encerra com código 1 sem RELEASE_MODE.
		assert.match(block, /RELEASE_MODE:\s*['"]?true['"]?/);
		assert.match(block, /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
	});

	it('C110 - can be started by hand and keeps the id-token permission', () => {
		const publish = read('publish.yml');
		// workflow_dispatch deixa o dono republicar sem mover a tag.
		assert.match(publish, /^\s*workflow_dispatch:/m);
		// A proveniência do npm usa o OIDC do GitHub.
		assert.match(publish, /id-token:\s*write/);
	});

	it('C110 - uses the same Node version as the ci workflow', () => {
		// O lock só é instalável pelo mesmo npm que o gerou; por isso a versão precisa ser igual.
		assert.equal(nodeVersion(read('publish.yml')), nodeVersion(read('ci.yml')));
	});
});
