
import React from 'react';
import { View, StyleSheet } from 'react-native';

interface MapProps {
  latitude: number;
  longitude: number;
  markers?: { latitude: number; longitude: number; title?: string }[];
  style?: any;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default function Map({ latitude, longitude, markers, style }: MapProps) {
  return <View style={[styles.container, style]} />;
}
