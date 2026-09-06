import React from 'react';
import { View, Text } from 'react-native';

function hashUsername(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

const AVATAR_COLORS = [
  '#5B9AA8',
  '#5CB97B',
  '#FF8A5B',
  '#8B5CF6',
  '#EF4444',
  '#3B82F6',
  '#F59E0B',
  '#10B981',
];

interface AvatarProps {
  username: string;
  size?: number;
}

export default function Avatar({ username, size = 40 }: AvatarProps) {
  const initial = (username ?? 'U').charAt(0).toUpperCase();
  const colorIndex = hashUsername(username ?? '') % AVATAR_COLORS.length;
  const bgColor = AVATAR_COLORS[colorIndex];
  const fontSize = size * 0.4;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor + '28',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize,
          fontWeight: '700',
          color: bgColor,
        }}
      >
        {initial}
      </Text>
    </View>
  );
}
