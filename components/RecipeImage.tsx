import React, { useState } from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase/client';

interface RecipeImageProps {
  recipeId: string;
  initialUrl: string | null;
  style?: ViewStyle;
  iconSize?: number;
}

export function RecipeImage({ recipeId, initialUrl, style, iconSize = 32 }: RecipeImageProps) {
  const [url, setUrl] = useState<string | null>(initialUrl || null);
  const [imageError, setImageError] = useState(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = React.useRef(0);

  // Poll for image_url only when none provided
  React.useEffect(() => {
    if (url || !recipeId) return;

    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > 36) {
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
          setUrl(data.image_url);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {}
    }, 5000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [recipeId, url]);

  const showImage = !!url && !imageError;

  return (
    <View style={[styles.container, style]}>
      {showImage ? (
        <Image
          source={{ uri: url! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => {
            console.warn('[RecipeImage] Image load error for recipe', recipeId, 'url:', url);
            setImageError(true);
          }}
        />
      ) : (
        <View style={styles.iconContainer}>
          <Ionicons name="restaurant-outline" size={iconSize} color="#888" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2a2a2a',
    overflow: 'hidden',
  },
  iconContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
