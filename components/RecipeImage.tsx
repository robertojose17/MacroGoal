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
  const [generationFailed, setGenerationFailed] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const shimmerOpacity = useRef(new Animated.Value(0.3)).current;

  // Shimmer animation — runs until image is loaded
  useEffect(() => {
    if (loaded) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerOpacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmerOpacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [loaded]);

  // Only call ensureRecipeImage when there is NO initialUrl
  useEffect(() => {
    if (initialUrl || generationFailed || !recipeId) return;
    if (url) return; // already have a url from a previous generation
    console.log('[RecipeImage] No initialUrl for recipe', recipeId, '— triggering generation');
    ensureRecipeImage(recipeId).then(newUrl => {
      if (newUrl) {
        console.log('[RecipeImage] Generated image ready for recipe', recipeId);
        setUrl(newUrl);
      } else {
        console.warn('[RecipeImage] Generation returned no URL for recipe', recipeId);
        setGenerationFailed(true);
      }
    });
  }, [recipeId]); // intentionally only run once on mount

  const handleLoad = () => {
    setLoaded(true);
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  const handleError = () => {
    console.warn('[RecipeImage] Image load error for recipe', recipeId, 'url:', url);
    // If the initialUrl itself failed to load, clear it and try generation once
    if (url === initialUrl && initialUrl && !generationFailed) {
      console.log('[RecipeImage] initialUrl failed, falling back to generation for recipe', recipeId);
      setUrl(null);
      setGenerationFailed(false); // allow one generation attempt
    } else {
      setGenerationFailed(true);
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Shimmer — shown while loading */}
      {!loaded && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.shimmer, { opacity: shimmerOpacity }]} />
      )}
      {/* Icon — shown when no url or generation failed */}
      {(!url || generationFailed) && (
        <View style={styles.iconContainer}>
          <Ionicons name="restaurant-outline" size={iconSize} color="#555" />
        </View>
      )}
      {/* Image — only shown when url exists and generation has not failed */}
      {url && !generationFailed && (
        <Animated.Image
          source={{ uri: url }}
          style={[StyleSheet.absoluteFill, styles.image, { opacity }]}
          onLoad={handleLoad}
          onError={handleError}
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
