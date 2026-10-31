import { useEffect, useRef } from 'react';
import { AppState, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { checkpoint, checkpointActor, actorStillCurrent } from '@/utils/premiumCheckpoints';
import { createFlowImpressionObserver } from '@/utils/premiumCheckpointContract';
import type { CheckpointDetail, PremiumFlow } from '@/utils/premiumCheckpointContract';
import type { ActorLease } from '@/utils/premiumCheckpointRuntime';

type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
type Impression = Extract<CheckpointDetail, { name: 'offer_displayed' }> | { name: 'inline_impression' };
/** Attach to the actual visible prompt/card. Loading, premium and modal states must disable it. */
export function usePremiumCheckpointVisibility(flow: PremiumFlow, enabled: boolean) {
  const focused = useIsFocused();
  const dimensions = useWindowDimensions();
  const latest = useRef({ enabled, focused, dimensions });
  latest.current = { enabled, focused, dimensions };
  const targets = useRef(new Map<string, { node: Measurable; detail: Impression }>());
  const observer = useRef(createFlowImpressionObserver());
  const actor = useRef<ActorLease | null>(checkpointActor());
  const mounted = useRef(false);
  const flowId = useRef(flow.flowId);
  useEffect(() => {
    mounted.current = true;
    let revision = 0;
    const tick = () => {
      const ownRevision = ++revision;
      if (!mounted.current || !latest.current.enabled || !latest.current.focused || AppState.currentState !== 'active') return;
      if (!actor.current) actor.current = checkpointActor();
      const pinned = actor.current;
      if (!actorStillCurrent(pinned) || flowId.current !== flow.flowId) return;
      for (const [key, target] of targets.current) {
        try { target.node.measureInWindow((x, y, width, height) => {
          if (!mounted.current || ownRevision !== revision || !latest.current.enabled || !latest.current.focused ||
              AppState.currentState !== 'active' || targets.current.get(key) !== target || !actorStillCurrent(pinned)) return;
          const viewport = latest.current.dimensions;
          if (![x,y,width,height].every(Number.isFinite) || width <= 0 || height <= 0) return;
          const visibleWidth = Math.max(0, Math.min(x + width, viewport.width) - Math.max(x, 0));
          const visibleHeight = Math.max(0, Math.min(y + height, viewport.height) - Math.max(y, 0));
          if (visibleWidth * visibleHeight < width * height * 0.9) return;
          if (observer.current.claim(key)) checkpoint(flow, target.detail, pinned);
        }); } catch { /* Observation must never interrupt navigation or purchase. */ }
      }
    };
    tick();
    const timer = setInterval(tick, 350);
    const subscription = AppState.addEventListener('change', () => { revision += 1; tick(); });
    return () => { mounted.current = false; revision += 1; clearInterval(timer); subscription.remove(); };
  }, [flow]);
  return (key: string, detail: Impression) => (node: Measurable | null) => {
    if (!node) { targets.current.delete(key); return; }
    if (!targets.current.has(key) && targets.current.size >= 32) return;
    // Copy at registration; never attach user-entered text or nutrition data.
    targets.current.set(key, { node, detail: JSON.parse(JSON.stringify(detail)) });
  };
}
