import { StyleSheet, View } from 'react-native';
import type { MessageKey } from '../core/i18n';
import type { NavKey } from '../core/nav';
import { useI18n } from './i18n';
import { Icon } from './Icon';
import { Screen } from './Screen';
import { Text } from './Text';
import { colors, radius } from './tokens';

/** Temporary screen body until the section's phase is built. */
export function Placeholder({ section }: { section: Exclude<NavKey, 'home'> }) {
  const { t } = useI18n();
  return (
    <Screen title={t(`nav.${section}`)}>
      <View style={styles.card}>
        <Icon name={section} size={28} color={colors.accentLight} />
        <Text size={15} color={colors.textSoft} style={styles.text}>{t(`screen.${section}` as MessageKey)}</Text>
        <Text weight="semibold" size={12} color={colors.accentLighter} style={styles.badge}>
          {t('common.comingSoon').toUpperCase()}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: 560,
    padding: 24,
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
  },
  text: { lineHeight: 22 },
  badge: { letterSpacing: 1 },
});
