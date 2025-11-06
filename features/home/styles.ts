import { Platform, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

export const createHomeStyles = (
  c: (typeof Colors)['light'] & { name: string },
) => {
  const isDarkLike = ['dark', 'neon', 'cyberpunk'].includes(c.name);
  const subtleBorder = isDarkLike
    ? 'rgba(255,255,255,0.16)'
    : 'rgba(17,24,28,0.08)';
  const mutedText = isDarkLike
    ? 'rgba(236,237,238,0.72)'
    : 'rgba(17,24,28,0.6)';
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.background,
    },
    container: {
      flex: 1,
    },
    contentContainer: {
      padding: 20,
      paddingBottom: 100,
      flexGrow: 1,
    },
    headerComponent: {
      backgroundColor: c.background,
      paddingBottom: 12,
    },
    headerContainer: {
      marginBottom: 24,
    },
    milestoneToast: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: subtleBorder,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
    },
    milestoneTitle: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    milestoneText: {
      fontSize: 14,
      lineHeight: 20,
    },
    heroCard: {
      backgroundColor: c.input,
      padding: 20,
      borderRadius: 16,
      marginBottom: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: subtleBorder,
      ...(Platform.OS === 'ios'
        ? {
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
          }
        : { elevation: 2 }),
    },
    heroGreeting: {
      fontSize: 24,
      fontWeight: '700',
      color: c.text,
    },
    heroSubtitle: {
      fontSize: 14,
      color: c.placeholder,
      marginTop: 4,
    },
    heroChipRow: {
      marginTop: 16,
      flexDirection: 'row',
    },
    heroChip: {
      backgroundColor: c.background,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: subtleBorder,
    },
    heroChipText: {
      color: c.tint,
      fontWeight: '600',
      fontSize: 13,
    },
    heroStatsRow: {
      flexDirection: 'row',
      marginTop: 12,
    },
    heroStat: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: c.background,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: subtleBorder,
    },
    heroStatSpacing: {
      marginRight: 12,
    },
    heroStatValue: {
      fontSize: 20,
      fontWeight: '700',
    },
    heroStatLabel: {
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 2,
      color: mutedText,
    },
    heroImpactSummary: {
      marginTop: 14,
      fontSize: 14,
      lineHeight: 20,
    },
    quickActionsHeader: {
      marginTop: 18,
    },
    quickActionsTitle: {
      fontSize: 15,
      fontWeight: '700',
    },
    quickActionsSubtitle: {
      marginTop: 2,
      fontSize: 13,
      color: mutedText,
    },
    quickActionScroll: {
      paddingTop: 12,
      paddingBottom: 4,
      paddingLeft: 2,
      paddingRight: 8,
    },
    quickActionCard: {
      width: 160,
      padding: 14,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      marginRight: 12,
    },
    quickActionIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    quickActionLabel: {
      fontWeight: '600',
      fontSize: 14,
    },
    quickActionDescription: {
      fontSize: 12,
      lineHeight: 16,
      marginTop: 4,
    },
    sectionSpacing: {
      marginBottom: 24,
    },
    sectionHeader: {
      marginBottom: 16,
    },
    safetyCardWrapper: {
      marginTop: 24,
    },
    sectionHeading: {
      color: c.text,
      fontWeight: '600',
      fontSize: 18,
    },
    sectionDescription: {
      color: mutedText,
      fontSize: 13,
      marginTop: 4,
    },
    feedIntroCard: {
      padding: 18,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 24,
    },
    feedIntroText: {
      marginBottom: 12,
    },
    surpriseHeading: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    surpriseSubheading: {
      fontSize: 13,
      lineHeight: 18,
      color: mutedText,
      marginTop: 4,
    },
    newPostsWrapper: {
      width: '100%',
      alignItems: 'center',
    },
    newPostsCard: {
      backgroundColor: c.tint,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
    },
    newPostsShadow: {
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    newPostsButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    newPostsText: {
      color: c.background,
      fontWeight: '700',
    },
    newPostsDismiss: {
      paddingRight: 10,
      paddingVertical: 8,
      paddingLeft: 4,
    },
    errorCard: {
      padding: 16,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: subtleBorder,
      marginBottom: 24,
    },
    errorText: {
      color: c.text,
      textAlign: 'center',
      marginBottom: 12,
      fontSize: 14,
      lineHeight: 20,
    },
    errorButton: {
      alignSelf: 'center',
      backgroundColor: c.tint,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 999,
    },
    errorButtonText: {
      color: c.background,
      fontWeight: '700',
    },
    quoteBanner: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 10,
      marginBottom: 12,
      position: 'relative',
    },
    quoteTitle: {
      color: c.tint,
      fontWeight: '600',
      marginBottom: 4,
    },
    quoteText: {
      color: c.text,
      fontSize: 14,
      paddingRight: 20,
    },
    quoteActions: {
      marginTop: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    quoteActionText: {
      color: c.tint,
      textDecorationLine: 'underline',
    },
    quoteDismiss: {
      position: 'absolute',
      right: 8,
      top: 8,
      padding: 4,
      borderRadius: 12,
    },
    label: {
      color: c.text,
      marginBottom: 4,
    },
    input: {
      backgroundColor: c.input,
      color: c.text,
      padding: 14,
      borderRadius: 10,
      marginBottom: 10,
    },
    button: {
      backgroundColor: c.tint,
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 20,
    },
    recButton: {
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 10,
    },
    promptCard: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 8,
      marginBottom: 10,
    },
    promptTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '600',
      marginTop: 10,
      marginBottom: 4,
    },
    promptText: {
      color: c.text,
      fontSize: 16,
    },
    preview: {
      width: '100%',
      height: 200,
      borderRadius: 10,
      marginBottom: 10,
    },
    buttonText: {
      color: c.text,
      fontWeight: '600',
    },
    recordingStatus: {
      color: c.tint,
      textAlign: 'center',
      marginBottom: 10,
    },
    authButton: {
      marginBottom: 20,
      alignItems: 'center',
    },
    authButtonText: {
      color: c.tint,
      fontSize: 14,
      textDecorationLine: 'underline',
    },
    formCard: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 10,
      marginBottom: 20,
    },
    sectionTitle: {
      color: c.text,
      fontWeight: '600',
      marginBottom: 8,
      fontSize: 16,
    },
    pollText: {
      color: c.text,
      fontSize: 14,
    },
    info: {
      color: c.text,
      fontSize: 14,
      marginBottom: 6,
    },
    noResults: {
      color: c.text,
      textAlign: 'center',
      marginTop: 20,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCard: {
      padding: 20,
      borderRadius: 10,
      width: '80%',
    },
    modalText: {
      fontSize: 16,
      textAlign: 'center',
    },
    modalOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: 20,
    },
    modalContent: {
      padding: 20,
      borderRadius: 10,
    },
  });
};

export type HomeStyles = ReturnType<typeof createHomeStyles>;
