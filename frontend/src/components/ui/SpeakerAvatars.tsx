import React from 'react';
import { logger } from '@/utils/logger';

const AVATAR_COUNT = 24;

const getAvatarPath = (index: number): string => `/avatars/avatar-${index}.png`;

interface SpeakerAvatarProps {
  index: number;
  size?: number;
  bgColor: string;
  iconColor: string;
  meetingId?: string;
}

// Hash function based on meeting ID + speaker index for stable but varied avatars
const getAvatarIndex = (meetingId: string, speakerIndex: number): number => {
  const seed = `${meetingId}-${speakerIndex}`;
  const hash = seed.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  return Math.abs(hash) % AVATAR_COUNT;
};

export const SpeakerAvatar: React.FC<SpeakerAvatarProps> = React.memo(({
  index,
  size = 44,
  bgColor,
  meetingId = 'default',
}) => {
  // Use meetingId + index so avatars vary per meeting but stay stable when renaming
  const avatarIndex = getAvatarIndex(meetingId, index);
  const [imgError, setImgError] = React.useState(false);
  const [imgLoaded, setImgLoaded] = React.useState(false);

  const handleImageError = () => {
    logger.warn(`Avatar image failed to load: ${getAvatarPath(avatarIndex)}`);
    setImgError(true);
  };

  const handleImageLoad = () => {
    setImgLoaded(true);
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '14px',
        backgroundColor: bgColor,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!imgError ? (
        <img
          src={getAvatarPath(avatarIndex)}
          alt={`Speaker ${index}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: size * 0.4,
            fontWeight: 'bold',
          }}
        >
          {String.fromCharCode(65 + (index % 26))}
        </div>
      )}
    </div>
  );
});

export const SpeakerAvatarSmall: React.FC<SpeakerAvatarProps> = React.memo(({
  index,
  size = 40,
  bgColor,
  meetingId = 'default',
}) => {
  // Use meetingId + index so avatars vary per meeting but stay stable when renaming
  const avatarIndex = getAvatarIndex(meetingId, index);
  const [imgError, setImgError] = React.useState(false);
  const [imgLoaded, setImgLoaded] = React.useState(false);

  const handleImageError = () => {
    logger.warn(`Avatar image failed to load: ${getAvatarPath(avatarIndex)}`);
    setImgError(true);
  };

  const handleImageLoad = () => {
    setImgLoaded(true);
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '12px',
        backgroundColor: bgColor,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!imgError ? (
        <img
          src={getAvatarPath(avatarIndex)}
          alt={`Speaker ${index}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: size * 0.4,
            fontWeight: 'bold',
          }}
        >
          {String.fromCharCode(65 + (index % 26))}
        </div>
      )}
    </div>
  );
});

export default SpeakerAvatar;
