
import { Redirect } from 'expo-router';

export default function Index() {
  // Root index always redirects to welcome
  // The _layout will handle navigation based on auth state
  return <Redirect href="/auth/welcome" />;
}
