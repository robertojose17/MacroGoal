import React, { createContext, useContext } from 'react';
import type { ProfileScreenServices } from './profileScreenServices';

const Environment = createContext<ProfileScreenServices | null>(null);
/** Supply one stable, route-owned services instance only after backend/activation approval. */
export function ProfileScreenProvider({ services, children }: {
  services: ProfileScreenServices; children: React.ReactNode;
}) {
  return <Environment.Provider value={services}>{children}</Environment.Provider>;
}
export function useProfileScreenServices() { return useContext(Environment); }
