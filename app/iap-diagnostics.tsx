
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import * as InAppPurchases from 'expo-in-app-purchases';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';

interface DiagnosticResult {
  test: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  message: string;
  details?: string;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  resultCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  resultIcon: {
    marginRight: spacing.sm,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  resultMessage: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  resultDetails: {
    fontSize: 12,
    marginTop: spacing.xs,
    fontFamily: 'monospace',
  },
  runButton: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  runButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  productIdBox: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
    fontFamily: 'monospace',
  },
});

export default function IAPDiagnosticsScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const isDark = colorScheme === 'dark';

  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const backgroundColor = isDark ? colors.dark.background : colors.light.background;
  const textColor = isDark ? colors.dark.text : colors.light.text;
  const borderColor = isDark ? colors.dark.border : colors.light.border;
  const cardBackground = isDark ? colors.dark.card : colors.light.card;

  const runDiagnostics = useCallback(async () => {
    setIsRunning(true);
    const diagnosticResults: DiagnosticResult[] = [];

    // Test 1: Platform Check
    diagnosticResults.push({
      test: 'Platform Check',
      status: Platform.OS === 'ios' ? 'pass' : 'warning',
      message: Platform.OS === 'ios' 
        ? 'Running on iOS - IAP supported' 
        : `Running on ${Platform.OS} - IAP only works on iOS`,
    });

    // Test 2: IAP Module Available
    try {
      // Check if the module is available by attempting to connect
      await InAppPurchases.connectAsync();
      diagnosticResults.push({
        test: 'IAP Module Available',
        status: 'pass',
        message: 'expo-in-app-purchases module is available',
      });
    } catch (error) {
      diagnosticResults.push({
        test: 'IAP Module Available',
        status: 'fail',
        message: 'Error checking IAP availability',
        details: error instanceof Error ? error.message : String(error),
      });
      setResults(diagnosticResults);
      setIsRunning(false);
      return;
    }

    // Test 3: Store Connection (already connected above)
    diagnosticResults.push({
      test: 'Store Connection',
      status: 'pass',
      message: 'Successfully connected to App Store',
    });

    // Test 4: Fetch Products
    try {
      const productIds = ['macro_goal_premium_monthly', 'macro_goal_premium_yearly'];
      const { results: products } = await InAppPurchases.getProductsAsync(productIds);
      
      if (products && products.length > 0) {
        diagnosticResults.push({
          test: 'Product Fetch',
          status: 'pass',
          message: `Found ${products.length} product(s)`,
          details: JSON.stringify(products.map(p => ({
            productId: p.productId,
            title: p.title,
            price: p.price,
          })), null, 2),
        });
      } else {
        diagnosticResults.push({
          test: 'Product Fetch',
          status: 'fail',
          message: 'No products found - Products not configured in App Store Connect',
          details: `Searched for: ${productIds.join(', ')}`,
        });
      }
    } catch (error) {
      diagnosticResults.push({
        test: 'Product Fetch',
        status: 'fail',
        message: 'Error fetching products',
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // Test 5: Purchase History
    try {
      const history = await InAppPurchases.getPurchaseHistoryAsync();
      diagnosticResults.push({
        test: 'Purchase History',
        status: 'pass',
        message: history.results.length > 0 
          ? `Found ${history.results.length} previous purchase(s)` 
          : 'No previous purchases',
        details: history.results.length > 0 
          ? JSON.stringify(history.results, null, 2) 
          : undefined,
      });
    } catch (error) {
      diagnosticResults.push({
        test: 'Purchase History',
        status: 'warning',
        message: 'Could not fetch purchase history',
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // Disconnect
    try {
      await InAppPurchases.disconnectAsync();
    } catch (error) {
      console.log('Error disconnecting from store:', error);
    }

    setResults(diagnosticResults);
    setIsRunning(false);
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'pass':
        return <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={24} color="#4CAF50" />;
      case 'fail':
        return <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="error" size={24} color="#F44336" />;
      case 'warning':
        return <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={24} color="#FF9800" />;
      case 'pending':
        return <ActivityIndicator size="small" color={textColor} />;
    }
  };

  const getStatusColor = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'pass':
        return '#4CAF50';
      case 'fail':
        return '#F44336';
      case 'warning':
        return '#FF9800';
      case 'pending':
        return textColor;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>IAP Diagnostics</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={[styles.infoBox, { backgroundColor: cardBackground, borderColor }]}>
          <Text style={[styles.infoTitle, { color: textColor }]}>About This Test</Text>
          <Text style={[styles.infoText, { color: textColor }]}>
            This diagnostic checks if your in-app purchase setup is working correctly. It verifies:
          </Text>
          <Text style={[styles.infoText, { color: textColor, marginTop: spacing.xs }]}>
            • Platform compatibility{'\n'}
            • IAP module availability{'\n'}
            • App Store connection{'\n'}
            • Product configuration{'\n'}
            • Purchase history
          </Text>
          <View style={[styles.productIdBox, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' }]}>
            <Text style={[styles.infoText, { color: textColor, fontSize: 12 }]}>
              Product IDs:{'\n'}
              • macro_goal_premium_monthly{'\n'}
              • macro_goal_premium_yearly
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Test Results</Text>
          
          {results.map((result, index) => (
            <View
              key={index}
              style={[
                styles.resultCard,
                { backgroundColor: cardBackground, borderColor: getStatusColor(result.status) },
              ]}
            >
              <View style={styles.resultHeader}>
                <View style={styles.resultIcon}>{getStatusIcon(result.status)}</View>
                <Text style={[styles.resultTitle, { color: textColor }]}>{result.test}</Text>
              </View>
              <Text style={[styles.resultMessage, { color: textColor }]}>{result.message}</Text>
              {result.details && (
                <Text style={[styles.resultDetails, { color: isDark ? '#aaa' : '#666' }]}>
                  {result.details}
                </Text>
              )}
            </View>
          ))}

          {results.length === 0 && !isRunning && (
            <Text style={[styles.infoText, { color: textColor, textAlign: 'center' }]}>
              No results yet. Run diagnostics to check your IAP setup.
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.runButton, { backgroundColor: colors.primary }]}
          onPress={runDiagnostics}
          disabled={isRunning}
        >
          {isRunning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.runButtonText, { color: '#fff' }]}>Run Diagnostics Again</Text>
          )}
        </TouchableOpacity>

        <View style={[styles.infoBox, { backgroundColor: cardBackground, borderColor, marginTop: spacing.lg }]}>
          <Text style={[styles.infoTitle, { color: textColor }]}>Next Steps</Text>
          <Text style={[styles.infoText, { color: textColor }]}>
            If "Product Fetch" fails:{'\n\n'}
            1. Create products in App Store Connect{'\n'}
            2. Use exact product IDs shown above{'\n'}
            3. Wait 2-4 hours for products to sync{'\n'}
            4. Test with a Sandbox account{'\n\n'}
            See IOS_IAP_TESTING_GUIDE.md for details.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
