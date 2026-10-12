import { useTranslation } from 'react-i18next';
import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';

export default function NotFoundScreen() {
  const { t } = useTranslation();
    return (
        <>
            <Stack.Screen options={{ title: t('localization.screens.notFoundTitle') }} />
            <View style={styles.container}>
                <Text style={styles.title}>{t('localization.screens.notFoundBody')}</Text>
                <Link href="/" style={styles.link}>
                    <Text style={styles.linkText}>{t('localization.screens.notFoundHome')}</Text>
                </Link>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    link: {
        marginTop: 15,
        paddingVertical: 15,
    },
    linkText: {
        fontSize: 14,
        color: '#2e78b7',
    },
});
