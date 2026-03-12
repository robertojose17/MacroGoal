
import { Redirect } from 'expo-router';

// This is just a redirect - all auth logic is in _layout.tsx
export default function Index() {
  // Expo Router will handle this redirect properly without state update errors
  return <Redirect href="/auth/welcome" />;
}
