import React, { useState } from 'react';
import { newPremiumFlow } from '@/utils/premiumCheckpointContract';
import type { PremiumSource, PremiumFlow } from '@/utils/premiumCheckpointContract';
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
export function PremiumCheckpointInline({ source, children, enabled = true }: {
  source: PremiumSource;
  children: React.ReactElement<any> | ((flow: PremiumFlow) => React.ReactElement<any>);
  enabled?: boolean;
}) {
  const [flow, setFlow] = useState(() => newPremiumFlow(source));
  const child = typeof children === 'function' ? children(flow) : children;
  return <InlineObservation key={flow.flowId} flow={flow} enabled={enabled}
    consumed={() => setFlow(newPremiumFlow(source))}>{child}</InlineObservation>;
}
