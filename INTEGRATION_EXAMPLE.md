
# How to Use Premium Features in Your App

Here are practical examples of how to integrate premium features throughout your app.

## Example 1: Dashboard Screen - Gate Advanced Analytics

```tsx
// app/(tabs)/dashboard.tsx
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';
import { usePremium } from '@/hooks/usePremium';

export default function DashboardScreen() {
  const { isPremium } = usePremium();

  return (
    <ScrollView>
      {/* Basic stats - available to all users */}
      <View>
        <Text>Today's Calories</Text>
        <ProgressCircle value={1500} max={2000} />
      </View>

      {/* Premium feature - 30-day trends */}
      <PremiumFeatureGate featureName="30-Day Trends">
        <View>
          <Text>30-Day Calorie Trend</Text>
          <LineChart data={last30Days} />
        </View>
      </PremiumFeatureGate>

      {/* Premium feature - Advanced analytics */}
      <PremiumFeatureGate featureName="Advanced Analytics">
        <View>
          <Text>Macro Distribution Analysis</Text>
          <PieChart data={macroBreakdown} />
        </View>
      </PremiumFeatureGate>
    </ScrollView>
  );
}
```

## Example 2: Profile Screen - Show Premium Badge

```tsx
// app/(tabs)/profile.tsx
import { usePremium } from '@/hooks/usePremium';

export default function ProfileScreen() {
  const { isPremium, loading } = usePremium();

  return (
    <View>
      <View style={styles.header}>
        <Text>John Doe</Text>
        {isPremium && (
          <View style={styles.premiumBadge}>
            <IconSymbol name="star" size={16} color="#FFD700" />
            <Text style={styles.premiumText}>Premium</Text>
          </View>
        )}
      </View>

      {/* Settings */}
      <TouchableOpacity onPress={() => router.push('/subscription')}>
        <Text>{isPremium ? 'Manage Subscription' : 'Upgrade to Premium'}</Text>
      </TouchableOpacity>
    </View>
  );
}
```

## Example 3: Custom Recipes - Premium Only Feature

```tsx
// app/custom-recipes.tsx
import { usePremium } from '@/hooks/usePremium';
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';

export default function CustomRecipesScreen() {
  return (
    <PremiumFeatureGate 
      featureName="Custom Recipes"
      fallbackMessage="Create and save your own custom recipes with multiple ingredients. Track exact macros for your favorite meals!"
    >
      <View>
        <Text>Create Custom Recipe</Text>
        <TextInput placeholder="Recipe name" />
        <Button title="Add Ingredient" />
        {/* Recipe builder UI */}
      </View>
    </PremiumFeatureGate>
  );
}
```

## Example 4: Data Export - Premium Feature

```tsx
// app/(tabs)/profile.tsx
import { usePremium } from '@/hooks/usePremium';

export default function ProfileScreen() {
  const { isPremium } = usePremium();

  const handleExportData = async () => {
    if (!isPremium) {
      Alert.alert(
        'Premium Feature',
        'Data export is a premium feature. Upgrade to export your nutrition data as CSV.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/subscription') }
        ]
      );
      return;
    }

    // Export logic for premium users
    const csvData = await generateCSV();
    await shareCSV(csvData);
  };

  return (
    <View>
      <TouchableOpacity onPress={handleExportData}>
        <Text>Export Data (CSV)</Text>
        {!isPremium && <Text style={styles.premiumLabel}>Premium</Text>}
      </TouchableOpacity>
    </View>
  );
}
```

## Example 5: Habit Tracking - Premium Feature

```tsx
// app/habits.tsx
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';

export default function HabitsScreen() {
  return (
    <PremiumFeatureGate 
      featureName="Habit Tracking"
      fallbackMessage="Track daily habits like water intake, gym visits, and meal prep. Build streaks and see your consistency score!"
    >
      <View>
        <Text>Daily Habits</Text>
        <CheckBox label="Drank 8 glasses of water" />
        <CheckBox label="Went to the gym" />
        <CheckBox label="Hit protein goal" />
        <Text>Current Streak: 7 days 🔥</Text>
      </View>
    </PremiumFeatureGate>
  );
}
```

## Example 6: Multiple Goal Phases - Premium Feature

```tsx
// app/edit-goals.tsx
import { usePremium } from '@/hooks/usePremium';

export default function EditGoalsScreen() {
  const { isPremium } = usePremium();

  return (
    <View>
      <Text>Current Goal</Text>
      <Picker selectedValue={currentGoal}>
        <Picker.Item label="Cut" value="cut" />
        <Picker.Item label="Maintain" value="maintain" />
        <Picker.Item label="Bulk" value="bulk" />
      </Picker>

      {/* Premium feature - Goal phases */}
      {isPremium ? (
        <View>
          <Text>Goal Phases (Premium)</Text>
          <Button title="Add New Phase" onPress={addPhase} />
          {phases.map(phase => (
            <View key={phase.id}>
              <Text>{phase.name}: {phase.startDate} - {phase.endDate}</Text>
            </View>
          ))}
        </View>
      ) : (
        <TouchableOpacity 
          style={styles.premiumPrompt}
          onPress={() => router.push('/subscription')}
        >
          <IconSymbol name="star" size={20} color="#FFD700" />
          <Text>Unlock Goal Phases with Premium</Text>
          <Text style={styles.subtitle}>
            Plan multiple phases (cut → maintain → bulk) with different calorie targets
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

## Example 7: Check Premium Status Before API Call

```tsx
// utils/exportData.ts
import { supabase } from '@/lib/supabase/client';

export async function exportUserData() {
  // Check premium status
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: userData } = await supabase
    .from('users')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (userData?.user_type !== 'premium') {
    throw new Error('Premium subscription required for data export');
  }

  // Proceed with export for premium users
  const data = await fetchAllUserData(user.id);
  return generateCSV(data);
}
```

## Example 8: Conditional Rendering in Lists

```tsx
// app/(tabs)/(home)/index.tsx
import { usePremium } from '@/hooks/usePremium';

export default function HomeScreen() {
  const { isPremium } = usePremium();

  return (
    <ScrollView>
      {/* Basic features */}
      <MealsList meals={todaysMeals} />
      
      {/* Premium upsell card */}
      {!isPremium && (
        <TouchableOpacity 
          style={styles.premiumCard}
          onPress={() => router.push('/subscription')}
        >
          <IconSymbol name="star" size={32} color="#FFD700" />
          <Text style={styles.premiumTitle}>Unlock Premium Features</Text>
          <Text style={styles.premiumSubtitle}>
            • Advanced analytics{'\n'}
            • Custom recipes{'\n'}
            • Habit tracking{'\n'}
            • Data export
          </Text>
          <Button title="Learn More" />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
```

## Best Practices

1. **Always show value before asking for upgrade**
   - Explain what the premium feature does
   - Show screenshots or previews if possible
   - Make the upgrade button clear and accessible

2. **Use the PremiumFeatureGate component for full screens**
   - Consistent UI across the app
   - Automatic upgrade prompts
   - Loading states handled

3. **Use the usePremium hook for conditional rendering**
   - Small UI changes (badges, labels)
   - Feature availability checks
   - Navigation logic

4. **Handle loading states**
   - Show loading indicator while checking status
   - Don't flash premium content then hide it
   - Cache status locally for better UX

5. **Provide clear upgrade paths**
   - Every premium prompt should link to /subscription
   - Explain benefits specific to that feature
   - Make it easy to restore purchases

## Testing Premium Features

```tsx
// For testing, you can temporarily override premium status
// DO NOT ship this to production!

// In development only:
if (__DEV__) {
  // Force premium status for testing
  const FORCE_PREMIUM = true;
  
  if (FORCE_PREMIUM) {
    return { isPremium: true, loading: false };
  }
}
```

Remember to remove any testing overrides before releasing to production!
