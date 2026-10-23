import { conversationFailureCopy } from '@/utils/coachConversationCopy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createConversationTransport } from '@/utils/coachConversationTransport';
import { parseMealConversation, type ScopedMealConversation } from '@/utils/coachMealConversation';
import { toLocalDateString } from '@/utils/dateUtils';
import { isSameCoachDay } from '@/utils/coachJourney';
import { isCoachPlaceholder } from '@/hooks/coachMessageLocalization';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
// expo/fetch supports SSE streaming in React Native
import { fetch as expoFetch } from 'expo/fetch';
import i18n from '@/lib/i18n';

const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export type CoachMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

export type MealPlanMeal = {
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
  grams?: number;
  quantity?: number;
  serving_unit?: string;
  dish_description?: string;
};

export type MealPlanDay = {
  date: string;
  meals: MealPlanMeal[];
};

export type ActionProposal = {
  action_id: string;
  action_type?: string;  // root-level action_type from edge function
  confirmation_token: string;
  proposal: {
    goal_type?: string;
    current_value?: number | string;
    proposed_value?: number | string;
    reason?: string;
    expected_effect?: string;
    is_reversible?: boolean;
    data_evidence?: Record<string, unknown>;
    action_type?: string;
    plan_name?: string;
    start_date?: string;
    end_date?: string;
    days?: MealPlanDay[];
    // add_food_to_diary fields
    food_name?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    fiber?: number;
    grams?: number;
    quantity?: number;
    serving_unit?: string;
    meal_type?: string;
    date?: string;
    // update_goal fields
    protein_g?: number;
    carbs_g?: number;
    fats_g?: number;
    fiber_g?: number;
    [key: string]: unknown;
  };
};

// Message type used internally in the hook (with streaming flag)
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  actionProposal?: ActionProposal;
  actionStatus?: 'pending' | 'confirming' | 'confirmed' | 'declined';
  suggestions?: string[];
  guidedMealChoice?: boolean;
  mealConversation?: ScopedMealConversation;
  isCoachNotice?: boolean;
};

type State =
  | { status: 'idle'; error: null }
  | { status: 'loading'; error: null }
  | { status: 'success'; error: null }
  | { status: 'error'; error: string };

type UseAICoachOptions = {
  mealConversation?: boolean;
  weightUnit?: string;
};

const WEB_SEARCH_KEYWORDS = [
  // Restaurants
  "restaurant", "mcdonald", "chipotle", "subway", "burger king", "starbucks",
  "taco bell", "wendy's", "wendys", "chick-fil-a", "chickfila", "domino",
  "pizza hut", "olive garden", "applebee", "menu", "order at", "eat at",
  // Stores & products
  "walmart", "target", "costco", "whole foods", "wholefood", "kroger",
  "publix", "aldi", "trader joe", "grocery", "store", "where to buy",
  "where can i buy", "where can i find", "price", "how much does",
  // Real-time / local
  "near me", "nearby", "current", "latest", "right now", "available",
  "in stock", "open now",
  // Specific food lookups
  "nutrition facts for", "calories in", "ingredients of", "macros of",
  "how many calories in",
];

function needsWebSearch(message: string): boolean {
  const lower = message.toLowerCase();
  return WEB_SEARCH_KEYWORDS.some((kw) => lower.includes(kw));
}

let msgCounter = 0;
function genMsgId() {
  msgCounter += 1;
  return `coach-${Date.now()}-${msgCounter}`;
}

export function useAICoach(options?: UseAICoachOptions) {
  const [conversationPending,setConversationPending]=useState(false);
  const journal=useRef<ReturnType<typeof createConversationTransport>|null>(null);
  const conversationOwner=useRef<string|null|undefined>(undefined);
  if(!journal.current)journal.current=createConversationTransport({store:AsyncStorage,scope:SUPABASE_PROJECT_URL,owner:async()=>{const {data,error}=await supabase.auth.getUser();return error?undefined:data.user?.id;},today:toLocalDateString,newId:()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3)|8).toString(16);}),invoke:async (body,owner,signal)=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token||session.user.id!==owner)throw Error('unauthorized');return expoFetch(`${SUPABASE_PROJECT_URL}/functions/v1/ai-coach`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,apikey:SUPABASE_ANON_KEY},body:JSON.stringify(body),signal});}});
  useEffect(()=>{
    if(!options?.mealConversation)return;
    let active=true,version=0;
    const refresh=()=>{const ownVersion=++version;void journal.current!.pending().then(p=>{if(active&&version===ownVersion)setConversationPending(!!p)}).catch(()=>{if(active&&version===ownVersion)setConversationPending(true)});};
    refresh();const timer=setInterval(refresh,15000);
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id!==conversationOwner.current)setConversationPending(false);setTimeout(()=>{if(active)refresh();},0);});
    return()=>{active=false;clearInterval(timer);subscription.unsubscribe();};
  },[options?.mealConversation]);
  const [state, setState] = useState<State>({ status: 'idle', error: null });
  const [pendingAction, setPendingAction] = useState<ActionProposal | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initResult, setInitResult] = useState<{ conversationId: string | null; hasHistory: boolean } | null>(null);
  const isInitializedRef = useRef(false);
  const weightUnit = options?.weightUnit ?? 'lb';
  const isMountedRef = useRef(true);
  const conversationIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── On mount: load or create today's conversation ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        console.log('[useAICoach] Initializing conversation history');
        const { data: { session } } = await supabase.auth.getSession();
        conversationOwner.current=session?.user?.id??null;
        const jwt = session?.access_token;
        if (!jwt) {
          console.log('[useAICoach] No session, skipping conversation load');
          return;
        }

        const authHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
          'apikey': SUPABASE_ANON_KEY,
        };

        // GET list of conversations
        console.log('[useAICoach] Fetching conversation list from coach-conversations');
        const listAbort = new AbortController();
        const listTimeoutId = setTimeout(() => {
          listAbort.abort();
          console.warn('[useAICoach] coach-conversations list fetch timed out after 10s — aborting');
        }, 10000);
        const listRes = await expoFetch(
          `${SUPABASE_PROJECT_URL}/functions/v1/coach-conversations`,
          { method: 'GET', headers: authHeaders, signal: listAbort.signal }
        );
        clearTimeout(listTimeoutId);

        if (!listRes.ok) {
          const errText = await listRes.text();
          console.warn('[useAICoach] Failed to fetch conversations:', listRes.status, errText.slice(0, 200));
          return;
        }

        const conversations: { id: string; last_message_at: string; created_at: string }[] = await listRes.json();
        console.log('[useAICoach] Conversations fetched, count:', conversations.length);

        const todayConv = conversations.find(c => isSameCoachDay(c.last_message_at || c.created_at || ''));

        let finalConvId: string | null = null;
        let finalHasHistory = false;

        if (todayConv) {
          console.log('[useAICoach] Found today\'s conversation, id:', todayConv.id);
          finalConvId = todayConv.id;
          if (isMountedRef.current) setConversationId(todayConv.id);

          // Load messages for this conversation
          console.log('[useAICoach] Loading messages for conversation:', todayConv.id);
          const msgsAbort = new AbortController();
          const msgsTimeoutId = setTimeout(() => {
            msgsAbort.abort();
            console.warn('[useAICoach] coach-conversations messages fetch timed out after 10s — aborting');
          }, 10000);
          const msgsRes = await expoFetch(
            `${SUPABASE_PROJECT_URL}/functions/v1/coach-conversations/${todayConv.id}/messages`,
            { method: 'GET', headers: authHeaders, signal: msgsAbort.signal }
          );
          clearTimeout(msgsTimeoutId);

          if (msgsRes.ok) {
            const rawMsgs: { id: string; role: string; content: string; created_at: string }[] = await msgsRes.json();
            console.log('[useAICoach] History messages loaded, count:', rawMsgs.length);
            if (rawMsgs.length > 0 && isMountedRef.current) {
              const mapped: Message[] = rawMsgs.map((m) => ({
                id: m.id,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                timestamp: new Date(m.created_at).getTime(),
              }));
              // Check for real history before setMessages so the flag is accurate
              finalHasHistory = mapped.some(
                (m) => !isCoachPlaceholder(m.content)
              );
              setMessages(mapped);
            }
          } else {
            const errText = await msgsRes.text();
            console.warn('[useAICoach] Failed to load messages:', msgsRes.status, errText.slice(0, 200));
          }
        } else {
          // Create a new conversation for today
          console.log('[useAICoach] No conversation today, creating new one');
          const createRes = await expoFetch(
            `${SUPABASE_PROJECT_URL}/functions/v1/coach-conversations`,
            { method: 'POST', headers: authHeaders, body: JSON.stringify({}) }
          );

          if (createRes.ok) {
            const created: { id: string; created_at: string } = await createRes.json();
            console.log('[useAICoach] New conversation created, id:', created.id);
            finalConvId = created.id;
            if (isMountedRef.current) setConversationId(created.id);
          } else {
            const errText = await createRes.text();
            console.warn('[useAICoach] Failed to create conversation:', createRes.status, errText.slice(0, 200));
          }
        }

        // Set conversationIdRef BEFORE setInitResult so sendMessage always reads the right id
        conversationIdRef.current = finalConvId;

        // Signal init complete atomically — both pieces of data in one setState call
        isInitializedRef.current = true;
        if (isMountedRef.current) {
          console.log('[useAICoach] Initialization complete — conversationId:', finalConvId, 'hasHistory:', finalHasHistory);
          setInitResult({ conversationId: finalConvId, hasHistory: finalHasHistory });
        }
      } catch (e: any) {
        console.warn('[useAICoach] Conversation init error:', e?.message);
        // Still signal init complete so the coach screen doesn't hang
        isInitializedRef.current = true;
        if (isMountedRef.current) {
          console.log('[useAICoach] Initialization complete after error — conversationId: null, hasHistory: false');
          setInitResult({ conversationId: null, hasHistory: false });
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore locally accepted replies only after remote history initialization.
  // This is local storage recovery, never a new AI request or server write.
  useEffect(()=>{
    if(!options?.mealConversation||!initResult)return;
    let active=true,version=0;
    const restore=async()=>{const ownVersion=++version;try{
      const owner=(await supabase.auth.getUser()).data.user?.id??null;
      if(!active||ownVersion!==version)return;
      if(conversationOwner.current===undefined)conversationOwner.current=owner;
      const rows=await journal.current!.restoreAccepted();
      const pending=!!await journal.current!.pending();
      if(rows.length&&((await supabase.auth.getUser()).data.user?.id!==rows[0].owner||toLocalDateString()!==rows[0].date))return;
      if(!active||ownVersion!==version||!isMountedRef.current)return;
      setMessages(prev=>{
        if(!active||ownVersion!==version)return prev;
        const next=[...prev];
        let matchBefore=next.length;
        for(const row of [...rows].reverse()){
          const value=parseMealConversation(row.reply.mealConversation);
          const mealConversation=value?{value,owner:row.owner,date:row.date,requestId:row.requestId}:undefined;
          const id='accepted-'+row.requestId;
          // Remote history uses database IDs and save timestamps, not the client
          // request ID or send time. Reconcile ordered complete turns, once each,
          // so slow replies do not duplicate and repeated identical turns remain.
          let existing=-1;
          for(let index=matchBefore-1;index>=0;index--){const m=next[index];
            if(m.id===id||(m.role==='assistant'&&m.content===row.reply.content&&
              next[index-1]?.role==='user'&&next[index-1].content===row.user.content)){existing=index;break;}}
          if(existing>=0){matchBefore=Math.max(0,existing-1);next[existing]={...next[existing],...(mealConversation?{mealConversation}:{})};continue;}
          // Separate history inserts can leave only the assistant. Attach the
          // missing user only for a unique orphan/accepted reply match. Repeated
          // text or a reply already paired with another user remains untouched.
          const matchingReplies=next.map((m,index)=>({m,index})).filter(({m})=>m.role==='assistant'&&m.content===row.reply.content);
          const orphan=matchingReplies.length===1?matchingReplies[0]:undefined;
          if(orphan&&orphan.index<matchBefore&&next[orphan.index-1]?.role!=='user'&&
            rows.filter(r=>r.reply.content===row.reply.content).length===1){
            next[orphan.index]={...orphan.m,...(mealConversation?{mealConversation}:{})};
            next.splice(orphan.index,0,{id:id+'-user',role:'user',...row.user});
            matchBefore=orphan.index;
            continue;
          }
          const preceding=next[matchBefore-1];
          const hasUser=preceding?.role==='user'&&preceding.content===row.user.content;
          const restored:Message[]=[...(hasUser?[]:[{id:id+'-user',role:'user' as const,...row.user}]),{id,role:'assistant',content:row.reply.content,timestamp:row.reply.timestamp,...(mealConversation?{mealConversation}:{})}];
          next.splice(matchBefore,0,...restored);
          if(hasUser)matchBefore--;
        }
        return next;
      });
      setConversationPending(pending);
    }catch{/* Existing pending reference remains available for explicit retry. */}};
    void restore();
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!active||!['SIGNED_OUT','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event))return;
      const owner=event==='SIGNED_OUT'?null:session?.user?.id??null;
      if(event!=='SIGNED_OUT'&&owner===conversationOwner.current)return;
      conversationOwner.current=owner;version++;setMessages([]);setConversationPending(false);
      if(owner)void restore();
    });
    return()=>{active=false;version++;subscription.unsubscribe();};
  },[initResult,options?.mealConversation]);

  const clearPendingAction = useCallback(() => {
    console.log('[useAICoach] Clearing pending action');
    setPendingAction(null);
  }, []);

  // ── Non-streaming sendMessage ──────────────────────────────────────────────
  const sendMessage = useCallback(
    async (apiMessages: CoachMessage[], userId?: string, isFirstMessage?: boolean, isReturningUserOpen?: boolean, recoverScoped = false): Promise<void> => {
      if (!apiMessages || apiMessages.length === 0) {
        console.log('[useAICoach] No messages to send');
        return;
      }

      setState({ status: 'loading', error: null });

      const newUserMsg = apiMessages[apiMessages.length - 1];
      const lastUserContent = newUserMsg?.content ?? '';
      const useWeb = options?.mealConversation ? false : needsWebSearch(lastUserContent);

      // Build full history: filter out streaming/placeholder/sentinel messages,
      // then append the new user message (deduplicating if already present).
      const historyMessages: CoachMessage[] = messagesRef.current
        .filter((m) => !m.isStreaming && !m.isCoachNotice && !isCoachPlaceholder(m.content))
        .map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp }));

      // Avoid duplicating the new user message if it's already the last item in history
      const lastHistory = historyMessages[historyMessages.length - 1];
      const alreadyPresent =
        lastHistory &&
        lastHistory.role === newUserMsg?.role &&
        lastHistory.content === newUserMsg?.content;
      if (!alreadyPresent && newUserMsg) {
        historyMessages.push({ role: newUserMsg.role, content: newUserMsg.content, timestamp: newUserMsg.timestamp });
      }

      // Limit to last 10 messages (5 pairs) to avoid token overflow, always keeping the last item
      const MAX_HISTORY = 10;
      const fullMessages: CoachMessage[] =
        historyMessages.length > MAX_HISTORY
          ? historyMessages.slice(historyMessages.length - MAX_HISTORY)
          : historyMessages;

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let placeholderMsg: Message = {id:genMsgId(),role:'assistant',content:'',timestamp:Date.now(),isStreaming:true};
      console.log('[useAICoach] Sending request to ai-coach');
      console.log('[useAICoach] History messages (from DB):', messagesRef.current.length, '→ sending:', fullMessages.length);
      // Do not log user conversation content.
      console.log('[useAICoach] weight_unit:', weightUnit);
      console.log('[useAICoach] conversation_id:', conversationId);
      console.log('[useAICoach] use_web:', useWeb);
      console.log('[useAICoach] is_first_message:', isFirstMessage ?? false);

      try {
        // Fetch session and ensure we have a valid access token — never fall back to anon key
        let { data: { session } } = await supabase.auth.getSession();
        let jwt = session?.access_token;
        let requestOwner = session?.user?.id;
        const requestDay = toLocalDateString();

        if (!jwt) {
          console.warn('[useAICoach] No access token — attempting session refresh');
          const { data: refreshData } = await supabase.auth.refreshSession();
          jwt = refreshData?.session?.access_token;
          requestOwner = refreshData?.session?.user?.id;
        }

        if (!jwt) {
          console.error('[useAICoach] Session expired after refresh attempt — aborting request');
          if(options?.mealConversation)throw Error('unauthorized');
          const sessionErrMsg: Message = {
            id: genMsgId(),
            role: 'assistant',
            content: i18n.t('localization.shared.sessionExpired'),
            timestamp: Date.now(),
            isStreaming: false,
          };
          if (isMountedRef.current) {
            setMessages((prev) => [...prev, sessionErrMsg]);
            setState({ status: 'error', error: 'Session expired' });
          }
          return;
        }

        // Add placeholder while waiting
        placeholderMsg = {
          id: genMsgId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        };
        if (isMountedRef.current) {
          setMessages((prev) => [...prev.filter(m=>!m.isCoachNotice), placeholderMsg]);
        }

        console.log('[useAICoach] Sending request with valid JWT (length:', jwt.length, ')');

        const abortController = new AbortController();
        if(!options?.mealConversation)timeoutId = setTimeout(() => {
          abortController.abort();
          console.warn('[useAICoach] Request timed out after 30s — aborting');
        }, 30000);

        const response = options?.mealConversation ? await journal.current!.run({messages:fullMessages,weight_unit:weightUnit,conversation_id:conversationIdRef.current??null,language:i18n.language},recoverScoped) : await expoFetch(
          `${SUPABASE_PROJECT_URL}/functions/v1/ai-coach`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              messages: fullMessages,
              weight_unit: weightUnit,
              conversation_id: conversationIdRef.current ?? null,
              use_web: useWeb,
              language: i18n.language,
              ...(isFirstMessage ? { is_first_message: true } : {}),
              ...(isReturningUserOpen ? { is_returning_user_open: true } : {}),
            }),
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.error('[useAICoach] HTTP error:', response.status, errText.slice(0, 300));
          // A 403 with "Subscription Required" is a paywall gate — remove placeholder silently
          // so coach.tsx can inject its own gate card. Any other error shows a visible message.
          const isSubscriptionError = response.status === 403 && errText.includes('Subscription Required');
          if (isMountedRef.current) {
            if (isSubscriptionError) {
              // Remove placeholder so coach.tsx can add the single upgrade message
              setMessages((prev) => prev.filter((m) => m.id !== placeholderMsg.id));
            } else {
              // Auth error or unexpected server error — show visible message in chat
              const errorContent = response.status === 401
                ? i18n.t('localization.shared.authError')
                : i18n.t('localization.shared.tryAgain');
              console.error('[useAICoach] Non-subscription error (status', response.status, ') — showing error in chat');
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderMsg.id
                    ? { ...m, content: errorContent, isStreaming: false }
                    : m
                )
              );
            }
            setState({ status: 'error', error: errText });
          }
          if (isSubscriptionError) {
            throw Object.assign(new Error('Subscription Required'), { isSubscriptionError: true });
          }
          throw new Error(`HTTP ${response.status}: ${errText.slice(0, 100)}`);
        }

        // Response is OK - cancel the timeout so it doesn't fire during streaming
        clearTimeout(timeoutId);

        // Read SSE stream token by token
        console.log('[useAICoach] Reading SSE stream');
        // Journaled replies are already buffered and committed. React Native's
        // global Response supports text(), but not body.getReader(). Only the
        // original expo/fetch response in the legacy path is a native stream.
        const reader = options?.mealConversation ? null : response.body!.getReader();
        let committedText = options?.mealConversation ? await response.text() : null;
        const decoder = new TextDecoder();
        let fullText = '';
        let actionProposal: ActionProposal | null = null;
        let suggestions: string[] | null = null;
        let guidedMealChoice = false;
        let mealConversation: ScopedMealConversation['value'] | null = null;
        let buffer = '';

        try {
          for (;;) {
            if (reader) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
            } else if (committedText !== null) {
              buffer += committedText;
              committedText = null;
            } else break;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              if (!trimmed.startsWith('data: ')) continue;
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                if (parsed.token) {
                  fullText += parsed.token;
                  // Update message in real time
                  if (isMountedRef.current) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === placeholderMsg.id
                          ? { ...m, content: fullText, isStreaming: true }
                          : m
                      )
                    );
                  }
                }
                if (parsed.done) {
                  actionProposal = parsed.action_proposal || null;
                  suggestions = parsed.suggestions || null;
                  guidedMealChoice = parsed.guided_meal_choice?.schema === 'guided_meal_choice_v1' && parsed.guided_meal_choice?.status === 'clarify';
                  mealConversation = options?.mealConversation ? parseMealConversation(parsed.meal_conversation) : null;
                  if (parsed.corrected_text) {
                    fullText = parsed.corrected_text;
                  }
                }
              } catch { /* skip malformed */ }
            }
          }
        } finally {
          reader?.releaseLock();
        }

        // Flush any remaining data in buffer after stream ends
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              if (parsed.token) {
                fullText += parsed.token;
              }
              if (parsed.done) {
                actionProposal = parsed.action_proposal || null;
                suggestions = parsed.suggestions || null;
                  guidedMealChoice = parsed.guided_meal_choice?.schema === 'guided_meal_choice_v1' && parsed.guided_meal_choice?.status === 'clarify';
                  mealConversation = options?.mealConversation ? parseMealConversation(parsed.meal_conversation) : null;
                if (parsed.corrected_text) {
                  fullText = parsed.corrected_text;
                }
              }
            } catch { /* skip malformed */ }
          }
        }

        console.log('[useAICoach] Stream complete, length:', fullText.length);

        // Guard: empty response — show retry message instead of empty bubble
        if (fullText.trim().length === 0) {
          console.warn('[useAICoach] Stream completed with empty response — showing retry message');
          if (isMountedRef.current) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderMsg.id
                  ? { ...m, content: i18n.t('localization.shared.emptyResponse'), isStreaming: false }
                  : m
              )
            );
            setState({ status: 'error', error: 'empty_response' });
          }
          return;
        }

        // A typed intake is actionable only for the same authenticated local day.
        const finalOwner = (mealConversation || options?.mealConversation) ? (await supabase.auth.getUser()).data.user?.id : undefined;
        if(options?.mealConversation && (finalOwner !== requestOwner || requestDay !== toLocalDateString()))throw Error('scope_changed');
        if(options?.mealConversation){actionProposal=null;suggestions=null;}
        const scopedMealConversation = mealConversation && requestOwner && finalOwner === requestOwner && requestDay === toLocalDateString() ? {value:mealConversation,owner:requestOwner,date:requestDay,requestId:response.headers.get('x-coach-request-id')??undefined} : undefined;

        if(options?.mealConversation && isMountedRef.current){
          await journal.current!.acknowledge(response.headers.get('x-coach-request-id'),{content:fullText,timestamp:placeholderMsg.timestamp,...(scopedMealConversation?{mealConversation:scopedMealConversation.value}:{})});
          if((await supabase.auth.getUser()).data.user?.id!==requestOwner||requestDay!==toLocalDateString())throw Error('scope_changed');
          if(isMountedRef.current)setConversationPending(false);
        }
        // Finalize message
        if (isMountedRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderMsg.id
                ? {
                    ...m,
                    content: fullText,
                    isStreaming: false,
                    ...(actionProposal
                      ? { actionProposal, actionStatus: 'pending' as const }
                      : {}),
                    ...(suggestions ? { suggestions } : {}),
                    ...(guidedMealChoice && !options?.mealConversation ? { guidedMealChoice: true } : {}),
                    ...(scopedMealConversation ? { mealConversation: scopedMealConversation } : {}),
                  }
                : m
            )
          );
        }

        if (actionProposal) {
          console.log('[useAICoach] Action proposal received:', actionProposal?.action_id);
        }

        setState({ status: 'success', error: null });

        // Save messages to Supabase from frontend (source of truth)
        const currentConvId = conversationIdRef.current;
        console.log('[useAICoach] Post-stream save — conversationId:', currentConvId, 'fullText length:', fullText.length);
        if (currentConvId && fullText.length > 0) {
          try {
            const lastUserMsg = apiMessages[apiMessages.length - 1];
            // Only save user message if it's not __FIRST_INTERACTION__
            if (lastUserMsg?.role === 'user' && lastUserMsg.content !== '__FIRST_INTERACTION__') {
              console.log('[useAICoach] Saving user message to Supabase, conv_id:', currentConvId);
              await supabase.from('coach_messages').insert({
                conversation_id: currentConvId,
                role: 'user',
                content: lastUserMsg.content,
              });
            }
            // Always save assistant message
            console.log('[useAICoach] Saving assistant message to Supabase, conv_id:', currentConvId);
            await supabase.from('coach_messages').insert({
              conversation_id: currentConvId,
              role: 'assistant',
              content: fullText,
            });
            // Update last_message_at
            await supabase.from('coach_conv_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', currentConvId);
            console.log('[useAICoach] Messages saved successfully to conv_id:', currentConvId);
          } catch (saveErr: any) {
            console.warn('[useAICoach] Failed to save messages from frontend:', saveErr?.message);
          }
        } else {
          console.warn('[useAICoach] Skipping message save — conversationId:', currentConvId, 'fullText length:', fullText.length);
        }
      } catch (e: any) {
        clearTimeout(timeoutId);
        if(options?.mealConversation){
          const pending=!!await journal.current!.pending().catch(()=>true);
          if(isMountedRef.current){
            setConversationPending(pending);
            const notice:Message={id:'coach-conversation-notice',role:'assistant',content:conversationFailureCopy(e?.message,pending,i18n.language.startsWith('es')),timestamp:Date.now(),isStreaming:false,isCoachNotice:true};
            setMessages(prev=>[...prev.filter(m=>m.id!==placeholderMsg.id&&!m.isCoachNotice),notice]);
            setState({status:'error',error:e?.message??'conversation_recovery_required'});
          }
          return; // One inline message; no duplicate native alert or automatic retry.
        }
        if (e?.name === 'AbortError') {
          console.warn('[useAICoach] Request aborted (timeout)');
          if (isMountedRef.current) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderMsg.id
                  ? { ...m, content: i18n.t('localization.shared.coachTimeout'), isStreaming: false }
                  : m
              )
            );
            setState({ status: 'error', error: 'timeout' });
          }
          return;
        }

        console.error('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('[useAICoach] ❌ CATCH BLOCK ERROR');
        console.error('[useAICoach] Error type:', e?.constructor?.name);
        console.error('[useAICoach] Error message:', e?.message);
        console.error('[useAICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (isMountedRef.current) {
          setState({ status: 'error', error: e?.message ?? 'Unexpected error' });
        }
        throw e;
      }
    },
    [weightUnit, conversationId, options?.mealConversation]
  );

  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.error : null;

  const recoverConversation=useCallback(async()=>{try{const record=await journal.current!.pending();if(!record){setConversationPending(false);return;}await sendMessage(record.body.messages.map(m=>({...m,timestamp:m.timestamp??Date.now()})),undefined,false,false,true);}catch{if(isMountedRef.current){setState({status:'error',error:'conversation_recovery_required'});setMessages(prev=>[...prev.filter(m=>!m.isCoachNotice),{id:'coach-conversation-notice',role:'assistant',content:conversationFailureCopy(undefined,true,i18n.language.startsWith('es')),timestamp:Date.now(),isCoachNotice:true}]);}}},[sendMessage]);
  return {
    conversationPending,recoverConversation,
    sendMessage,
    loading,
    error,
    pendingAction,
    clearPendingAction,
    setPendingAction,
    messages,
    setMessages,
    conversationId,
    setConversationId,
    initResult,
  };
}
