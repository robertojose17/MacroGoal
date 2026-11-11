import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { newPremiumFlow } from '@/utils/premiumCheckpointContract';
import type { PremiumSource, PremiumFlow, PremiumHostScreen } from '@/utils/premiumCheckpointContract';
import { usePremiumCheckpointVisibility } from '@/hooks/usePremiumCheckpointVisibility';

function InlineObservation({ flow, children, enabled, consumed }: {
  flow: PremiumFlow; children: React.ReactElement<any>; enabled: boolean; consumed: () => void;
}) {
  const observe = usePremiumCheckpointVisibility(flow, enabled);
  const child = React.Children.only(children);
  const observeRef = observe('inline', { name: 'inline_impression' });
  return React.cloneElement(child, {
    ref: (node: any) => {
      observeRef(node);
      const existing = child.props.ref;
      if (typeof existing === 'function') existing(node);
      else if (existing && typeof existing === 'object') existing.current = node;
    },
    onPress: (...args: any[]) => {
      try { return child.props.onPress?.(...args); }
      finally { consumed(); }
    },
  });
}
/** No additional native layout. Render the route using the supplied immutable flow. */
type InlineProps = {
  source: PremiumSource;
  screen?: PremiumHostScreen;
  children: React.ReactElement<any> | ((flow: PremiumFlow) => React.ReactElement<any>);
  enabled?: boolean;
};
export function PremiumCheckpointInline(props: InlineProps) {
  // A persistent badge can move between tabs without unmounting. A new context
  // synchronously remounts its flow, so no click or impression uses the old tab.
  return <PremiumCheckpointInlineFlow key={`${props.source}:${props.screen ?? 'legacy'}`} {...props} />;
}
function PremiumCheckpointInlineFlow({ source, screen, children, enabled = true }: InlineProps) {
  const [flow, setFlow] = useState(() => newPremiumFlow(source, screen));
  const [consumed, setConsumed] = useState(false);
  const focused = useIsFocused();
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current && consumed) { setFlow(newPremiumFlow(source, screen)); setConsumed(false); }
    wasFocused.current = focused;
  }, [focused, consumed, source, screen]);
  const child = typeof children === 'function' ? children(flow) : children;
  return <InlineObservation key={flow.flowId} flow={flow} enabled={enabled && !consumed}
    consumed={() => setConsumed(true)}>{child}</InlineObservation>;
}
