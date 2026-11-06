/**
 * Node gatilho do RD Station Marketing (esqueleto da fatia S1).
 *
 * Recebe os webhooks da RD (conversões e oportunidades). O registro e a remoção automática do
 * webhook na RD entram na fatia S11, com seus testes; aqui fica só o contrato do node para o
 * pacote compilar e o `package.json` apontar para um arquivo que existe.
 */
import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class RdStationMarketingTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'RD Station Marketing Trigger',
		// Nome persistido nos workflows salvos: não pode mudar depois do lançamento (porta de uma via).
		name: 'rdStationMarketingTrigger',
		icon: { light: 'file:rdStationMarketing.svg', dark: 'file:rdStationMarketing.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when RD Station Marketing sends a conversion or opportunity event',
		defaults: { name: 'RD Station Marketing Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'rdStationMarketingOAuth2Api', required: true }],
		// A RD espera resposta 2xx em 5 s, então respondemos assim que o corpo chega.
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		],
		properties: [],
	};

	// Ciclo de vida do webhook na RD: a implementação real entra na fatia S11 (com testes).
	webhookMethods = {
		default: {
			async checkExists(): Promise<boolean> {
				return false;
			},
			async create(): Promise<boolean> {
				return true;
			},
			async delete(): Promise<boolean> {
				return true;
			},
		},
	};

	// Emite o corpo que a RD enviou como um item do workflow.
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData();
		return { workflowData: [this.helpers.returnJsonArray(body as IDataObject)] };
	}
}
