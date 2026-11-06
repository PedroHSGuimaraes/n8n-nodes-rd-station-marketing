/**
 * Registro dos recursos do node de ação.
 *
 * O node monta a tela e despacha a execução a partir desta lista: acrescentar um recurso novo é
 * criar o módulo dele e incluí-lo aqui. A ordem da lista é a ordem do dropdown "Resource".
 */
import type { ResourceModule } from '../descriptions';
import { analyticsResource } from './analytics';
import { emailResource, formResource, landingPageResource, popupResource } from './assets';
import { automationFlowResource } from './automationFlow';
import { campaignResource } from './campaign';
import { contactResource } from './contact';
import { customFieldResource } from './customField';
import { eventResource } from './event';
import { funnelResource } from './funnel';
import { productCatalogResource } from './productCatalog';
import { segmentationResource } from './segmentation';
import { webhookResource } from './webhook';

export const RESOURCES: ResourceModule[] = [
	contactResource,
	customFieldResource,
	funnelResource,
	segmentationResource,
	automationFlowResource,
	emailResource,
	landingPageResource,
	popupResource,
	formResource,
	campaignResource,
	analyticsResource,
	eventResource,
	productCatalogResource,
	webhookResource,
];
