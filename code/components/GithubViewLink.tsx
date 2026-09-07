import * as Haptics from 'expo-haptics';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { GITHUB_VIEW_URL } from '../shared/defaults';
import { colors } from '../shared/theme';

type Props = {
  /** footer = muted home/download text; button = Account row */
  variant?: 'footer' | 'button';
};

export function GithubViewLink({ variant = 'footer' }: Props) {
  const onPress = () => {
    void Haptics.selectionAsync();
    void Linking.openURL(GITHUB_VIEW_URL);
  };

  if (variant === 'button') {
    return (
      <Pressable
        style={styles.btn}
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel="View Windsage source on GitHub"
      >
        <Text style={styles.btnText}>View on GitHub</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={styles.foot}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel="View Windsage source on GitHub"
    >
      <Text style={styles.footText}>View on GitHub</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  foot: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  footText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
});
