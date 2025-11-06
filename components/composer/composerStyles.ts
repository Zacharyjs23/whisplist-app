import { StyleSheet } from 'react-native';

type ComposerPalette = {
  background: string;
  input: string;
  text: string;
  tint: string;
};

export type ComposerStyles = ReturnType<typeof createComposerStyles>;

export const createComposerStyles = (palette: ComposerPalette) =>
  StyleSheet.create({
    formCard: {
      backgroundColor: palette.input,
      padding: 12,
      borderRadius: 10,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: palette.input,
    },
    sectionTitle: {
      color: palette.text,
      fontWeight: '600',
      marginBottom: 8,
      fontSize: 16,
    },
    label: {
      color: palette.text,
      marginBottom: 4,
    },
    input: {
      backgroundColor: palette.background,
      color: palette.text,
      padding: 14,
      borderRadius: 10,
      marginBottom: 10,
      textAlignVertical: 'top',
    },
    counter: {
      color: palette.text,
      opacity: 0.7,
      fontSize: 12,
      alignSelf: 'flex-end',
      marginTop: -6,
      marginBottom: 10,
    },
    helper: {
      fontSize: 12,
      marginTop: -4,
      marginBottom: 8,
    },
    circleLoading: {
      marginVertical: 12,
    },
    circleChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginVertical: 8,
      marginHorizontal: -4,
    },
    circleChip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      marginHorizontal: 4,
      marginBottom: 8,
      backgroundColor: palette.background,
    },
    circleChipText: {
      fontWeight: '600',
    },
    circleChipSubtext: {
      fontSize: 11,
      marginTop: 2,
    },
    circleButtonRow: {
      flexDirection: 'row',
      marginTop: 8,
    },
    circleActionButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    circleActionButtonLast: {
      marginRight: 0,
    },
    circleActionText: {
      fontSize: 14,
      fontWeight: '600',
    },
    supportNotice: {
      fontSize: 12,
      marginTop: 4,
    },
    supportInAppLabel: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 6,
    },
    inputStack: {
      marginTop: 12,
    },
    advancedButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 12,
    },
    advancedButtonActive: {
      borderWidth: 2,
    },
    advancedButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    advancedBadge: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.tint,
    },
    supportSummaryCard: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 16,
      backgroundColor: palette.background,
    },
    supportSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    supportSummaryTitle: {
      fontSize: 14,
      fontWeight: '700',
    },
    supportSummaryAmount: {
      fontSize: 18,
      fontWeight: '700',
    },
    supportSummaryText: {
      fontSize: 14,
      lineHeight: 20,
    },
    supportSummaryLink: {
      fontSize: 12,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    fundingBlock: {
      backgroundColor: palette.background,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    progressBarOuter: {
      height: 6,
      borderRadius: 4,
      backgroundColor: palette.background,
      overflow: 'hidden',
      marginTop: -12,
      marginBottom: 16,
    },
    progressBarInner: {
      height: 6,
      borderRadius: 4,
    },
    button: {
      backgroundColor: palette.tint,
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 20,
      position: 'relative',
    },
    buttonText: {
      color: palette.text,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: palette.input,
      padding: 12,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: -10,
      marginBottom: 12,
    },
    secondaryButtonErrorSpacing: {
      marginTop: 12,
    },
    link: {
      textDecorationLine: 'underline',
      fontSize: 12,
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    chip: {
      backgroundColor: palette.background,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
    chipText: {
      color: palette.text,
      fontSize: 12,
      fontWeight: '600',
    },
    stageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -4,
      marginBottom: 12,
    },
    stageChip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      marginHorizontal: 4,
      marginBottom: 8,
      backgroundColor: palette.background,
    },
    stageChipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    promptCard: {
      backgroundColor: palette.background,
      padding: 12,
      borderRadius: 8,
      marginBottom: 10,
    },
    promptTitle: {
      color: palette.text,
      fontSize: 18,
      fontWeight: '600',
      marginTop: 10,
      marginBottom: 4,
    },
    promptText: {
      color: palette.text,
      fontSize: 16,
    },
    typePromptCard: {
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      marginBottom: 14,
    },
    typePromptTitle: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 4,
    },
    typePromptText: {
      fontSize: 13,
      lineHeight: 18,
    },
    supportRow: {
      borderRadius: 10,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    supportText: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    recButton: {
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 10,
    },
    preview: {
      width: '100%',
      height: 200,
      borderRadius: 10,
      marginBottom: 10,
    },
    authButton: {
      marginBottom: 20,
      alignItems: 'center',
    },
    authButtonText: {
      color: palette.tint,
      fontSize: 14,
      textDecorationLine: 'underline',
    },
    badgeDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.background === '#000' ? '#fff' : palette.tint,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalDismiss: {
      ...StyleSheet.absoluteFillObject,
    },
    modalContainer: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderWidth: 1,
      overflow: 'hidden',
      maxHeight: 620,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      backgroundColor: palette.input,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '600',
    },
    modalClose: {
      fontSize: 14,
      fontWeight: '600',
    },
    modalScrollContent: {
      paddingHorizontal: 20,
      paddingVertical: 20,
    },
    advancedSection: {
      marginBottom: 24,
    },
    advancedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    advancedLabel: {
      fontSize: 15,
      fontWeight: '600',
      flex: 1,
      marginRight: 12,
    },
    modalSubLabel: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6,
    },
    advancedSectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 6,
    },
    advancedDescription: {
      fontSize: 13,
      marginBottom: 12,
    },
    sectionSpacing: {
      marginTop: 16,
    },
  });

export const withAlpha = (input: string, alpha: number): string => {
  const value = input.trim();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expanded =
      hex.length === 3
        ? hex
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : hex;
    if (expanded.length === 6) {
      const r = parseInt(expanded.slice(0, 2), 16);
      const g = parseInt(expanded.slice(2, 4), 16);
      const b = parseInt(expanded.slice(4, 6), 16);
      if ([r, g, b].every((channel) => Number.isFinite(channel))) {
        const clamped = Math.max(0, Math.min(alpha, 1));
        return `rgba(${r}, ${g}, ${b}, ${clamped})`;
      }
    }
  }
  return value;
};
