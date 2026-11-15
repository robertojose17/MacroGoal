export type Nutrient = 'calories' | 'protein' | 'carbs' | 'fats' | 'fiber';
export type Values = Record<Nutrient, number>;
export interface Portion {
 grams: number | null; quantity: number; serving_description: string | null; serving_unit: string | null;
 food_id: string | null; food_item_id: string | null; food_name: string | null; food_brand: string | null;
 meal_id: string; is_scheduled: boolean; logged_at: string | null;
}
export interface Binding { values: Values; portion: Portion }
export interface Declaration { version: 'manual-nutrition-capture-v1'; declaredFields: Nutrient[]; values: Values }
export interface Receipt { requestId: string; requestDigest: string; eventVersion: number; status: 'active' | 'revoked' }
export interface ReadState { version: 'logged-nutrition-evidence-state-v1'; ownerId: string; itemId: string; revision: string | null; expected: Binding; evidenceVersion: number; receipt: Receipt | null; evidence?: unknown }
export interface RegisterRequest { version: 'user-entered-v1'; kind: 'register'; requestId: string; itemId: string; revision: string; expectedEvidenceVersion: number; expected: Binding; declaredFields: Nutrient[] }
export type IntentPortion = Pick<Portion,'grams'|'quantity'|'serving_description'|'serving_unit'|'food_id'|'meal_id'|'is_scheduled'|'logged_at'>;
export interface LoggedIntent { values: Values; portion: IntentPortion }
export interface ConfirmedLogInput { declaration: Declaration; authenticatedOwnerId: string; confirmedItemId: string; loggedIntent: LoggedIntent }
export interface EvidenceInput extends ConfirmedLogInput { readState: ReadState; requestId: string }
export interface FullEvidenceInput extends Omit<EvidenceInput,'loggedIntent'> { expectedLoggedBinding: Binding }
export type Failure = Readonly<{ok:false;reason:string}>;
export type Preparation = Failure | Readonly<{ok:true;request:RegisterRequest}>;
export type Capture = Failure | Readonly<{ok:true;declaration:Declaration}>;
export interface JournalEntry { version:'manual-evidence-journal-v1';ownerId:string;itemId:string;request:RegisterRequest }
export interface Session { ownerId:string }
export interface Journal {
 append(entry:JournalEntry):Promise<boolean>;
 read(ownerId:string,requestId:string):Promise<JournalEntry|null>;
 listPending(ownerId:string,itemId:string):Promise<JournalEntry[]>;
 clearExact(ownerId:string,requestId:string,expected:JournalEntry):Promise<boolean>;
}
// Local enumeration only; callers authenticate owner and expose summaries, not payloads.
export interface OwnerPendingJournal extends Journal {
 listOwnerPending(ownerId:string):Promise<JournalEntry[]>;
 inspectOwnerPending(ownerId:string):Promise<OwnerPendingInspection[]>;
 discardInvalidExact(ownerId:string,requestId:string,expectedRaw:string):Promise<boolean>;
 discardInvalidKeyExact(ownerId:string,storageKey:string,expectedRaw:string):Promise<boolean>;
}
// Private service data only. Never expose raw corrupted storage to UI or RPC.
export type OwnerPendingInspection = {kind:'valid';entry:JournalEntry}|{kind:'invalid';requestId:string;raw:string}|{kind:'invalid-key';storageKey:string;raw:string};
export interface StoragePort { getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;getAllKeys():Promise<readonly string[]>;removeItem(key:string):Promise<void> }
export interface ControllerPorts<S extends Session=Session> {
 getSession():Promise<S|null>;readEvidence(itemId:string,requestId:string|null,session:S):Promise<ReadState>;
 registerEvidence(request:RegisterRequest,session:S):Promise<ReadState>;
 journal:Journal;newRequestId():string;
}
export type ControllerStatus='inactive'|'busy'|'stopped_without_dispatch'|'invalid_identity'|'recovery_required'|'not_registered'|'journal_verification_failed'|'uncertain'|'receipt_found'|'nothing_to_recover'|'invalid_journal'|'stale_or_invalid_journal';
export interface ControllerResult {readonly status:ControllerStatus;readonly reason?:string;readonly requestId?:string;readonly receipt?:Receipt;readonly currentEvidenceActive?:'not_asserted';readonly cleanupPending?:boolean}
export type NutrientValues = Values;
export type ManualNutritionDeclaration = Declaration;
export type ManualEvidenceRequest = RegisterRequest;
export type ConfirmedManualLogInput = ConfirmedLogInput;
export interface EvidenceSession extends Session {accessToken?:string}
