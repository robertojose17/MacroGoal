import React, { useState } from 'react';
import { newPremiumFlow } from '@/utils/premiumCheckpointContract';
import type { PremiumSource } from '@/utils/premiumCheckpointContract';
import { usePremiumCheckpointVisibility } from '@/hooks/usePremiumCheckpointVisibility';

/** Observes the existing native touch target; adds no wrapper layout or product UI. */
export function PremiumCheckpointInline({ source, children, enabled = true }: {
  source: PremiumSource; children: React.ReactElement<any>; enabled?: boolean;
}) {
  const [flow] = useState(() => newPremiumFlow(source));
  const observe = usePremiumCheckpointVisibility(flow, enabled);
  const child = React.Children.only(children);
  const observeRef = observe('inline', { name: 'inline_impression' });
  return React.cloneElement(child, { ref: (node: any) => {
    observeRef(node);
    const existing = child.props.ref;
    if (typeof existing === 'function') existing(node);
    else if (existing && typeof existing === 'object') existing.current = node;
  } });
}
