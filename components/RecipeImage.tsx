import React, { useEffect, useState, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase/client';

interface RecipeImageProps {
  recipeId: string;
  initialUrl: string | null;
  style?: ViewStyle;
  iconSize?: number;
}

export function RecipeImage({ recipeId, initialUrl, style, iconSize = 32 }: RecipeImageProps) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [loaded, setLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const shimmerOpacity = useRef(new Animated.Value(0.3)).current;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  // Shimmer animation — runs while no image loaded
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

  // Poll for image_url when none provided
  useEffect(() => {
    // If we already have a URL, no need to poll
    if (initialUrl || !recipeId) return;

    console.log('[RecipeImage] No initialUrl for recipe', recipeId, '— starting poll every 5s');

    const startPolling = () => {
      pollRef.current = setInterval(async () => {
        pollCount.current += 1;
        console.log('[RecipeImage] Polling for image_url, attempt', pollCount.current, 'recipeId:', recipeId);
        // Stop after 3 minutes (36 × 5s)
        if (pollCount.current > 36) {
          console.warn('[RecipeImage] Poll limit reached (36 attempts) for recipe', recipeId, '— stopping');
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        try {
          const { data } = await supabase
            .from('recipes')
            .select('image_url')
            .eq('id', recipeId)
            .single();
          if (data?.image_url) {
            console.log('[RecipeImage] image_url found for recipe', recipeId, '— stopping poll');
            setUrl(data.image_url);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // ignore poll errors
        }
      }, 5000);
    };

    startPolling();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [recipeId, initialUrl]);

  const handleLoad = () => {
    console.log('[RecipeImage] Image loaded for recipe', recipeId);
    setLoaded(true);
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  const handleError = () => {
    console.warn('[RecipeImage] Image load error for recipe', recipeId, 'url:', url);
    setImageError(true);
    // If the URL failed and it wasn't the initialUrl, clear it and let polling find a new one
    if (url !== initialUrl) {
      setUrl(null);
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Shimmer placeholder */}
      {!loaded && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.shimmer, { opacity: shimmerOpacity }]} />
      )}
      {/* Icon when no image */}
      {(!url || imageError) && (
        <View style={styles.iconContainer}>
          <Ionicons name="restaurant-outline" size={iconSize} color="#555" />
        </View>
      )}
      {/* Image */}
      {url && !imageError && (
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
