import { View, ActivityIndicator } from 'react-native';
import { NotificationBell } from "@/components/NotificationBell";

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <NotificationBell />
      
<ActivityIndicator size="large" />
    </View>
  );
}
