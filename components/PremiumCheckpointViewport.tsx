import React, { createContext, forwardRef, useContext, useMemo, useRef } from 'react';
import { ScrollView } from 'react-native';
import type { ScrollViewProps } from 'react-native';
export type PremiumMeasurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
export type PremiumViewportRef = React.RefObject<PremiumMeasurable | null>;
export const PremiumViewportContext = createContext<readonly PremiumViewportRef[]>([]);
/** Same ScrollView and props, with measured ancestor clips for nested prompt visibility. */
export const PremiumCheckpointScrollView = forwardRef<ScrollView, ScrollViewProps>(function PremiumCheckpointScrollView(props, forwarded) {
  const parent = useContext(PremiumViewportContext);
  const own = useRef<PremiumMeasurable | null>(null);
  const viewports = useMemo(() => [...parent, own], [parent]);
  return <PremiumViewportContext.Provider value={viewports}><ScrollView {...props} ref={node => {
    own.current = node?.getNativeScrollRef() ?? null;
    if (typeof forwarded === 'function') forwarded(node);
    else if (forwarded) forwarded.current = node;
  }} /></PremiumViewportContext.Provider>;
});
