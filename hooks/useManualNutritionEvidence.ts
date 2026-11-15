import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { captureManualNutrition } from '@/utils/manualNutritionDeclaration';
import { MANUAL_NUTRITION_EVIDENCE_ENABLED, makeManualNutritionEvidenceServices } from '@/utils/manualNutritionEvidenceServices';
import type { ConfirmedLogInput, ControllerResult, Nutrient, Values } from '@/utils/manualNutritionTypes';

/** Optional evidence only. Never creates food, changes targets, or starts work on mount. */
export function useManualNutritionEvidence(scope: boolean, contextKey: string, es: boolean, close: () => void) {
  const edited = useRef<Partial<Record<Nutrient, string>>>({});
  const epoch = useRef(0), focused = useRef(false), foreground = useRef(AppState.currentState === 'active');
  const owner = useRef<string | null>(null);
  const observedAuthOwner = useRef<string | null | undefined>(undefined);
  const service = useRef<ReturnType<typeof makeManualNutritionEvidenceServices> | null>(null);
  type PendingRow={itemId:string|null;requestId:string;invalid?:true};
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([]);
  const [pendingBusy, setPendingBusy] = useState(false);
  const pendingFlight = useRef(false);
  const saveFlight = useRef<number|null>(null);
  const invalidate = useCallback(() => {
    epoch.current++; service.current?.dispose(); service.current = null; owner.current = null;
    pendingFlight.current = false;
    saveFlight.current = null;
    if(focused.current){setPendingRows([]);setPendingBusy(false);}
  }, []);
  useEffect(() => { edited.current = {}; invalidate(); }, [contextKey, invalidate]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setPendingRows([]);setPendingBusy(false);
    return () => { focused.current = false; invalidate(); };
  }, [invalidate]));
  useEffect(() => {
    if (!scope || !MANUAL_NUTRITION_EVIDENCE_ENABLED) return;
    const app = AppState.addEventListener('change', state => {
      foreground.current = state === 'active'; if (state !== 'active') invalidate();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null;
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && (owner.current !== null || service.current !== null)) || (observedAuthOwner.current !== undefined && observedAuthOwner.current !== next)
        || (owner.current !== null && owner.current !== next)) invalidate();
      observedAuthOwner.current = next;
    });
    return () => { app.remove(); subscription.unsubscribe(); invalidate(); };
  }, [scope, invalidate]);
  const snapshot = (values: Values) => {
    if(scope && MANUAL_NUTRITION_EVIDENCE_ENABLED)saveFlight.current=epoch.current;
    return ({
    epoch: epoch.current,
    capture: scope && MANUAL_NUTRITION_EVIDENCE_ENABLED ? captureManualNutrition({ ...edited.current }, values) : null,
  });};
  type Snapshot = ReturnType<typeof snapshot>;
  const pendingAction = async (action:'list'|'recover'|'discard', row?:PendingRow) => {
    if(!scope || !MANUAL_NUTRITION_EVIDENCE_ENABLED || pendingFlight.current || saveFlight.current!==null || !focused.current || !foreground.current)return;
    const generation=epoch.current;
    const valid=()=>focused.current && foreground.current && epoch.current===generation;
    pendingFlight.current=true;setPendingBusy(true);
    try {
      const session=await supabase.auth.getSession();
      if(!valid())return;
      const actor=session.data.session?.user.id;
      if(session.error || !actor)throw Error('authentication_required');
      if(owner.current!==actor){service.current?.dispose();service.current=null;}
      owner.current=actor;
      const current=service.current ?? makeManualNutritionEvidenceServices(id=>valid() && owner.current===id);service.current=current;
      if(action==='list') {
        const rows=await current.listPending(actor);
        if(!valid())return;
        setPendingRows(rows);
        if(!rows.length)Alert.alert(es?'Sin registros pendientes':'No pending records');
      } else if(row) {
        if(action==='discard') {
          const cleared=await current.discardPending(actor,row.itemId,row.requestId);
          if(!valid())return;
          if(!cleared)throw Error('local_record_changed');
          setPendingRows(rows=>rows.filter(r=>r.requestId!==row.requestId));
        } else {
          if(row.invalid || !row.itemId)throw Error('invalid_journal');
          const result=await current.recover(actor,row.itemId,row.requestId);
          if(!valid())return;
          Alert.alert(es?'Revisión del registro':'Record review',result.status==='receipt_found'
            ? (es?'Se encontró el recibo del registro. Esto no confirma que la información siga vigente.':'The record receipt was found. This does not confirm that the information remains current.')
            : (es?'No se pudo confirmar el registro. El alimento no se ha vuelto a añadir. Puedes revisarlo otra vez explícitamente.':'The record could not be confirmed. The food was not added again. You can explicitly review it again.'));
          if(result.status==='receipt_found' && !result.cleanupPending)setPendingRows(rows=>rows.filter(r=>r.requestId!==row.requestId));
        }
      }
    } catch {
      if(valid())Alert.alert(es?'No se pudo completar':'Could not complete',es?'No vuelvas a añadir el alimento. El registro adicional podría haberse guardado; puedes revisarlo de nuevo.':'Do not add the food again. The additional record may already have been saved; you can review it again.');
    } finally {if(valid()){pendingFlight.current=false;setPendingBusy(false);}}
  };
  const selectPending = (row:PendingRow) => {
    if(pendingBusy || !focused.current || !foreground.current)return;
    const generation=epoch.current;
    const valid=()=>focused.current && foreground.current && generation===epoch.current;
    Alert.alert(es?'Registro pendiente':'Pending record',es?'Revisar utiliza la misma solicitud y no añade el alimento otra vez. Descartar borra solo el registro local de recuperación; no borra el alimento ni revoca información que ya se haya guardado en el servidor.':'Review uses the same request and does not add the food again. Discard removes only the local recovery record; it does not delete the food or revoke information already saved on the server.',[
      {text:es?'Cancelar':'Cancel',style:'cancel'},
      ...(!row.invalid && row.itemId ? [{text:es?'Revisar / Reintentar':'Review / Retry',onPress:()=>{if(valid())void pendingAction('recover',row);}}] : []),
      {text:es?'Descartar solo registro local':'Discard local record only',style:'destructive',onPress:()=>{if(valid())void pendingAction('discard',row);}},
    ]);
  };
  const finish = async (saved: Snapshot, input: Omit<ConfirmedLogInput, 'declaration'>): Promise<boolean> => {
    if (!scope || !MANUAL_NUTRITION_EVIDENCE_ENABLED) return false;
    const valid = () => focused.current && foreground.current && saved.epoch === epoch.current;
    if (!valid()) return true; // Food already saved; never navigate a stale/account-switched screen.
    if (!saved.capture?.ok) return false;
    owner.current = input.authenticatedOwnerId;
    service.current?.dispose();
    const current = makeManualNutritionEvidenceServices(actor => valid() && owner.current === actor);
    service.current = current;
    const show = (result: ControllerResult, requestId?: string) => {
      if (!valid() || owner.current !== input.authenticatedOwnerId) return;
      const exactId = result.requestId || requestId;
      Alert.alert(es ? 'Alimento guardado' : 'Food saved',
        es ? 'El alimento está en tu diario. No pudimos confirmar el registro adicional de los valores ingresados. No hace falta añadirlo otra vez.'
          : 'The food is in your diary. We could not confirm the additional record of entered values. Do not add the food again.',
        [
          { text: es ? 'Cerrar' : 'Close', onPress: () => { if (valid()) close(); } },
          ...(exactId ? [{ text: es ? 'Revisar / Reintentar' : 'Review / Retry', onPress: () => {
            // Explicit same-request recovery only. No log_food or new request ID here.
            void (async () => {
              if (!valid() || pendingFlight.current || saveFlight.current!==null) return;
              pendingFlight.current=true;setPendingBusy(true);
              try {
                const recovered = await current.recover(input.authenticatedOwnerId, input.confirmedItemId, exactId);
                if (!valid()) return;
                if (recovered.status === 'receipt_found') close(); else show(recovered, exactId);
              } catch { if (valid()) show({ status: 'uncertain' }, exactId); }
              finally {if(valid()){pendingFlight.current=false;setPendingBusy(false);}}
            })();
          } }] : []),
        ], { cancelable: false });
    };
    try {
      const result = await current.beginConfirmedLog({ ...input, declaration: saved.capture.declaration });
      if (!valid()) return true;
      if (result.status === 'receipt_found' || result.status === 'not_registered') return false;
      let requestId = result.requestId;
      if (!requestId && result.status === 'recovery_required') {
        const ids = await current.pending(input.authenticatedOwnerId, input.confirmedItemId);
        if (ids.length === 1) requestId = ids[0]; // Never choose among multiple pending requests.
      }
      show(result, requestId); return true;
    } catch { show({ status: 'uncertain' }); return true; }
  };
  return { edited: (nutrient: Nutrient, text: string) => { edited.current[nutrient] = text; }, snapshot, finish,
    pendingRows,pendingBusy,reviewPending:()=>pendingAction('list'),selectPending,
    isBusy:()=>pendingFlight.current || saveFlight.current!==null,
    releaseSave:(saved:Snapshot)=>{if(saveFlight.current===saved.epoch)saveFlight.current=null;},
    isCurrent: (saved: Snapshot) => focused.current && foreground.current && saved.epoch === epoch.current,
    enabled: scope && MANUAL_NUTRITION_EVIDENCE_ENABLED };
}
