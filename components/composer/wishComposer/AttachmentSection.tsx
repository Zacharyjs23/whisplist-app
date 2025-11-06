import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { ComposerSharedProps, UploadState } from './sharedTypes';

type AttachmentSectionProps = ComposerSharedProps &
  UploadState & {
    posting: boolean;
    selectedImage: string | null;
    onPickImage: () => void;
  };

export const AttachmentSection: React.FC<AttachmentSectionProps> = ({
  posting,
  uploadProgress,
  uploadStage,
  selectedImage,
  onPickImage,
  styles,
  theme,
  t,
  hitSlop,
}) => {
  return (
    <>
      {posting && uploadProgress !== null ? (
        <Text style={[styles.helper, { color: theme.text }]}>
          {uploadStage === 'audio'
            ? t('composer.uploadingAudio', 'Uploading audio')
            : uploadStage === 'image'
              ? t('composer.uploadingImage', 'Uploading image')
              : t('composer.uploading', 'Uploading')}{' '}
          {Math.min(100, Math.max(0, uploadProgress ?? 0))}%
        </Text>
      ) : null}

      {selectedImage ? (
        <ExpoImage
          source={selectedImage}
          style={styles.preview}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      ) : null}

      <TouchableOpacity
        style={styles.button}
        onPress={onPickImage}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={
          selectedImage
            ? t('composer.changeImage', 'Change Image')
            : t('composer.attachImage', 'Attach Image')
        }
      >
        <Text style={styles.buttonText}>
          {selectedImage
            ? t('composer.changeImage', 'Change Image')
            : t('composer.attachImage', 'Attach Image')}
        </Text>
      </TouchableOpacity>
    </>
  );
};
