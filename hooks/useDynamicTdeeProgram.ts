import { parseObservationProgram } from '@/utils/dynamicTdeeObservation';
import { useObservationResource } from './useObservationResource';
export function useDynamicTdeeProgram(userId?: string) {
  const resource = useObservationResource('program', parseObservationProgram, userId);
  return { program:resource.value, loading:resource.loading, error:resource.error, refresh:resource.refresh, updateSettings:resource.updateSettings };
}
