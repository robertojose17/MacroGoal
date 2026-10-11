/** TEMPORARY development screen. Import only from a __DEV__-guarded route. */
import React, { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { hideAsync } from 'expo-splash-screen';
import { FollowRequestProvider, useFollowRequestEnvironment } from './FollowRequestEnvironment';
import { FollowRequestBell, FollowRequestInbox } from './FollowRequestInbox';
import { getFollowRequestStrings } from './followRequestStrings';
import { useFollowRequestInbox } from './useFollowRequestInbox';
import { AcceptedSocialProfileScreen } from './AcceptedSocialProfileScreen';
import { profileRangeInput } from './profileScreenPresentation';
import type { NutritionRange } from './profileScreenPresentation';
import { createPrivacyDevFixture, QA_IDS, QA_TODAY } from './PrivacyDevFixture';
import type { PrivacyDevFixture, QAProfileMode } from './PrivacyDevFixture';

const theme = { background: '#f7f8fa', card: '#fff', text: '#111827', secondary: '#5d6675',
  border: '#d1d5db', primary: '#14885f', onPrimary: '#fff', danger: '#b91c1c' };
const baseStrings = getFollowRequestStrings('en');
const strings = { ...baseStrings, title: 'Follow requests · QA only',
  explanation: `Fictional local data. ${baseStrings.explanation}` };
function Control({ label, onPress }: { label: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.control}>
    <Text style={styles.controlText}>{label}</Text>
  </Pressable>;
}
function PreviewBody({ fixture, onReset }: { fixture: PrivacyDevFixture; onReset(): void }) {
  const environment = useFollowRequestEnvironment();
  const inbox = useFollowRequestInbox(environment.session, environment.adapter);
  const controller = useMemo(() => fixture.createProfileController(), [fixture]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [range, setRange] = useState<NutritionRange>('today');
  const [custom, setCustom] = useState<{ fromDate: string; toDate: string }>();
  const [notice, setNotice] = useState('Start: 2 incoming requests; Cedar’s profile is private.');
  const input = useMemo(() => profileRangeInput(QA_IDS.cedar, range, new Date(`${QA_TODAY}T12:00:00`), custom), [range, custom]);
  useLayoutEffect(() => {
    controller.setScope(input ? { session: fixture.session, profile: input } : null);
    return () => controller.setScope(null);
  }, [controller, fixture, input]);
  const select = (mode: QAProfileMode) => { fixture.setProfileMode(mode); void controller.refresh();
    setNotice(`Cedar: ${mode} scenario. Incoming approvals never grant reverse access.`); };
  return <View style={styles.root}>
    <SafeAreaView edges={['top']} style={styles.qa}>
      <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>PRIVACY QA · DEV ONLY</Text>
        <FollowRequestBell count={inbox.state.totalPending} expanded={inbox.state.visible} onPress={inbox.open} theme={theme} strings={strings} />
      </View>
      <Text style={styles.note}>Fictional users · In memory · No live services</Text>
      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
        <Control label="Reset all QA data" onPress={onReset} />
        <Control label="Empty inbox" onPress={() => { fixture.emptyInbox(); inbox.open(); }} />
        <Control label="Inbox error + retry" onPress={() => { fixture.failNextList(); inbox.open(); }} />
        <Control label="Decision error + retry" onPress={() => { fixture.failNextDecision(); inbox.open(); }} />
        <Control label="Limited profile" onPress={() => select('limited')} />
        <Control label="Accepted profile" onPress={() => select('accepted')} />
        <Control label="Profile error + retry" onPress={() => { fixture.failNextProfile(); void controller.refresh(); }} />
      </ScrollView>
      <Text accessibilityLiveRegion="polite" style={styles.note}>{notice}</Text>
    </SafeAreaView>
    <AcceptedSocialProfileScreen state={state} range={range} custom={custom}
      onBack={onReset}
      onRefresh={() => { void controller.refresh(); }} onRange={setRange}
      onCustom={(fromDate, toDate) => {
        if (!profileRangeInput(QA_IDS.cedar, 'custom', new Date(`${QA_TODAY}T12:00:00`), { fromDate, toDate })) return false;
        setCustom({ fromDate, toDate }); setRange('custom'); return true;
      }}
      onAction={action => { void controller.change(action); }}
      onConnections={direction => { void controller.openConnections(direction); }}
      onCloseConnections={controller.closeConnections}
      onBlockConfirm={key => { void controller.block(key); }} />
    <FollowRequestInbox state={inbox.state} theme={theme} strings={strings} onClose={inbox.close}
      onRetry={inbox.refresh} onLoadMore={inbox.loadMore} onDecision={(row, decision) => { void inbox.decide(row, decision); }} />
  </View>;
}
function PreviewSession({ onReset }: { onReset(): void }) {
  const fixture = useMemo(() => createPrivacyDevFixture(), []);
  return <FollowRequestProvider session={fixture.session} adapter={fixture.inbox}>
    <PreviewBody fixture={fixture} onReset={onReset} />
  </FollowRequestProvider>;
}
function DevelopmentPreview() {
  useEffect(() => { void hideAsync().catch(() => {}); }, []);
  const [generation, setGeneration] = useState(0);
  return <SafeAreaProvider><PreviewSession key={generation} onReset={() => setGeneration(n => n + 1)} /></SafeAreaProvider>;
}
export default function PrivacyDevPreview() {
  // No hooks, fake session, timers or controllers are created in a production render.
  if (typeof __DEV__ === 'undefined' || !__DEV__) return null;
  return <DevelopmentPreview />;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f8fa' }, qa: { backgroundColor: '#fff5cc', paddingHorizontal: 12, paddingBottom: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '800', fontSize: 15, color: '#563e00' }, note: { fontSize: 12, lineHeight: 17, color: '#563e00' },
  controls: { maxHeight: 108, marginVertical: 6 }, controlsContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  control: { minHeight: 44, borderWidth: 1, borderColor: '#aa8c38', borderRadius: 8, justifyContent: 'center', paddingHorizontal: 9 },
  controlText: { fontSize: 12, fontWeight: '600', color: '#563e00' },
});
