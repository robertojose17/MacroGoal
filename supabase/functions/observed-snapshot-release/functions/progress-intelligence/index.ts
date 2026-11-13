import { createObservationDispatcher } from '../observed-program/dispatcher.ts';
import { createObservedProgressDispatcher } from '../observed-progress/dispatcher.ts';
import { legacyHandler } from './legacy-handler.ts';
import { createPreviewDispatcher } from './dispatcher.ts';
import { createProgressDispatcher } from '../preview-progress/dispatcher.ts';

// Preserve the complete v10 dispatcher as the default, including its preview route.
const v10 = createPreviewDispatcher(legacyHandler, () => import('../preview-program/runtime.ts'));
const progress = createProgressDispatcher(v10, () => import('../preview-progress/runtime.ts'));
const observation = createObservationDispatcher(progress, () => import('../observed-program/runtime.ts'));
Deno.serve(createObservedProgressDispatcher(observation, () => import('../observed-progress/runtime.ts')));
