import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
    flexGrow: 1,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
  },
  banner: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  wishBox: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
  },
  wishHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wishCategory: {
    fontSize: 12,
    fontWeight: '600',
  },
  stageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    marginHorizontal: -4,
  },
  stageChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginHorizontal: 4,
    marginBottom: 6,
  },
  stageChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stageDescription: {
    fontSize: 13,
    marginTop: 6,
  },
  stageNudge: {
    fontSize: 13,
    marginTop: 2,
    fontStyle: 'italic',
  },
  circleBanner: {
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  circleBannerSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  favoriteSummary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  favoriteSummaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  favoriteQuote: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 6,
  },
  favoriteNoteInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  circleBannerButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginLeft: 12,
  },
  circleBannerButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  wishText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 8,
  },
  likes: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  boostedLabel: {
    color: '#facc15',
    fontSize: 12,
    marginTop: 4,
  },
  pollOption: {
    backgroundColor: '#2e2e2e',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  pollOptionText: {
    textAlign: 'center',
  },
  fundingCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
  },
  splitPayCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    gap: 12,
  },
  splitPayStats: {
    fontSize: 14,
    fontWeight: '600',
  },
  splitPayDeadline: {
    fontSize: 12,
  },
  splitPayButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  splitPayButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  splitPayStatusText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  splitPayActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  splitPaySecondaryButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  splitPaySecondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  supportCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  supportCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  supportCardText: {
    fontSize: 14,
    lineHeight: 20,
  },
  fundingProgressOuter: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fundingProgressInner: {
    height: 10,
    borderRadius: 999,
  },
  fundingInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  fundingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  fundingPercent: {
    fontSize: 13,
    fontWeight: '600',
  },
  fundingSupporters: {
    fontSize: 12,
    marginTop: 6,
  },
  commentBox: {
    backgroundColor: '#1a1a1a',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  replyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  successToast: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  successToastText: {
    fontSize: 13,
    fontWeight: '600',
  },
  signInNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  nickname: {
    fontSize: 12,
    marginBottom: 2,
  },
  comment: {
    fontSize: 14,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
  },
  label: {
    marginBottom: 4,
  },
  input: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  errorText: {
    color: '#f87171',
    textAlign: 'center',
    marginTop: 20,
  },
  button: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    fontWeight: '600',
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
});

