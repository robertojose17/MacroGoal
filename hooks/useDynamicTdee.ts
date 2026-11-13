import { useDynamicTdeeProgram } from './useDynamicTdeeProgram';
export function useDynamicTdee(userId?: string) {
  const resource = useDynamicTdeeProgram(userId);
  return { ...resource, estimate: resource.program?.estimate ?? null };
}
