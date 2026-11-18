import { StyleSheet, View } from 'react-native';
import { useI18n } from '../ui/i18n';
import { Icon } from '../ui/Icon';
import { LogoMark, Wordmark } from '../ui/Logo';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, radius } from '../ui/tokens';

export default function Home() {
  const { t } = useI18n();
  return (
    <Screen title={t('nav.home')}>
      <View style={styles.brand}>
        <LogoMark size={52} />
        <Wordmark size={28} />
      </View>
      <Text size={16} color={colors.textSoft} style={styles.intro}>{t('home.intro')}</Text>
      <View style={styles.note}>
        <Icon name="shield" size={18} color={colors.textMuted} />
        <Text size={14} color={colors.textMuted} style={styles.noteText}>{t('home.noContent')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  intro: { maxWidth: 560, lineHeight: 24 },
  note: {
    maxWidth: 560,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  noteText: { flex: 1, lineHeight: 20 },
});
