/**
 * Registro dos recursos do node de ação.
 *
 * O node monta a tela e despacha a execução a partir desta lista: acrescentar um recurso novo é
 * criar o módulo dele e incluí-lo aqui. A ordem da lista é a ordem do dropdown "Resource".
 */
import type { ResourceModule } from '../descriptions';
import { contactResource } from './contact';
import { customFieldResource } from './customField';
import { funnelResource } from './funnel';

export const RESOURCES: ResourceModule[] = [contactResource, customFieldResource, funnelResource];
