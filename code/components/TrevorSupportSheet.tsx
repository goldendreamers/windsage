import * as Haptics from 'expo-haptics';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { openTrevorProjectDonate } from '../core/contact';
import { colors } from '../shared/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function TrevorSupportSheet({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>The Trevor Project</Text>
          <Text style={styles.body}>
            The Trevor Project is the leading national organization providing crisis intervention and
            suicide prevention services to lesbian, gay, bisexual, transgender, queer & questioning
            (LGBTQ) young people under 25.
          </Text>
          <Pressable
            style={styles.donate}
            onPress={() => {
              void Haptics.selectionAsync();
              openTrevorProjectDonate();
              onClose();
            }}
            accessibilityRole="link"
            accessibilityLabel="Donate to the Trevor Project"
          >
            <Text style={styles.donateText}>Donate</Text>
          </Pressable>
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.bgMid,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 34,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  donate: {
    marginTop: 6,
    backgroundColor: colors.accentDim,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  donateText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  close: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 15,
  },
});
