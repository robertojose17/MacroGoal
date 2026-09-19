import React, { useEffect, useState, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ensureRecipeImage } from '@/utils/recipeImageGenerator';

interface RecipeImageProps {
  recipeId: string;
  initialUrl: string | null;
  style?: ViewStyle;
  iconSize?: number;
}

export function RecipeImage({ recipeId, initialUrl, style, iconSize = 32 }: RecipeImageProps) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [loaded, setLoaded] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const shimmerOpacity = useRef(new Animated.Value(0.3)).current;

  // Shimmer animation
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerOpacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmerOpacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmerOpacity]);

  // Generate image if null
  useEffect(() => {
    if (!url && recipeId) {
      console.log('[RecipeImage] No image for recipe', recipeId, '— triggering generation');
      ensureRecipeImage(recipeId).then(newUrl => {
        if (newUrl) {
          console.log('[RecipeImage] Image ready for recipe', recipeId);
          setUrl(newUrl);
        }
      });
    }
  }, [recipeId, url]);

  const handleLoad = () => {
    setLoaded(true);
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  return (
    <View style={[styles.container, style]}>
      {/* Shimmer placeholder */}
      {!loaded && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.shimmer, { opacity: shimmerOpacity }]} />
      )}
      {/* Chef icon when no URL yet */}
      {!url && !loaded && (
        <View style={styles.iconContainer}>
          <Ionicons name="restaurant-outline" size={iconSize} color="#555" />
        </View>
      )}
      {/* Actual image */}
      {url && (
        <Animated.Image
          source={{ uri: url, cache: 'force-cache' }}
          style={[StyleSheet.absoluteFill, styles.image, { opacity }]}
          onLoad={handleLoad}
          onError={() => {
            console.warn('[RecipeImage] Image load error for recipe', recipeId, '— clearing url');
            setUrl(null);
          }}
          resizeMode="cover"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
  },
  shimmer: {
    backgroundColor: '#2a2a3e',
  },
  iconContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
