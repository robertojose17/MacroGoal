
import { StyleSheet } from 'react-native';

export const colors = {
  // NEW COLOR SYSTEM - Clean, Minimalistic, High-Contrast
  // 1. General Background (behind cards)
  primaryBackground: '#F7F8FC',      // Blanco de Fondo - light off-white for screens
  
  // 2. Cards / Containers - UPDATED for better contrast
  card: '#F0F2F7',                   // Slightly darker than pure white for better separation
  cardDark: '#252740',               // Dark mode cards (unchanged)
  
  // 3. Primary Text (titles, numbers, dates)
  primaryText: '#2B2D42',            // Dark Gray - strong contrast for readability
  text: '#2B2D42',                   // Alias for primaryText
  textDark: '#F1F5F9',               // Light text for dark mode (unchanged)
  textSecondary: '#6B7280',          // Muted text
  textSecondaryDark: '#A0A2B8',      // Muted text for dark mode (unchanged)
  
  // 4. Progress Lines (rings, general progress bars - NOT macro bars)
  accent: '#5B9AA8',                 // Light Blue - for progress accents, primary actions
  primary: '#5B9AA8',                // Alias for accent
  primaryDark: '#4A8A98',            // Darker version of accent
  
  // 5. Success / Brand Color (positive actions, buttons, check marks)
  success: '#5CB97B',                // Emerald Green - for success states, goal met
  secondary: '#5CB97B',              // Alias for success
  
  // 6. Warning / Attention
  warning: '#FF8A5B',                // Copper Orange - for warnings, over target highlights
  
  // Backgrounds
  background: '#F7F8FC',             // Using primaryBackground
  backgroundDark: '#1A1C2E',         // Dark background (unchanged)
  
  // Status colors
  error: '#EF4444',                  // Keep existing error color
  info: '#5B9AA8',                   // Using accent color
  
  // UI elements
  border: '#E5E7EB',                 // Light border to match new background
  borderDark: '#3A3C52',             // Dark mode border (unchanged)
  disabled: '#CBD5E1',               // Keep existing disabled color
  
  // Card borders - NEW
  cardBorder: '#D4D6DA',             // Subtle neutral gray for card borders (light mode)
  cardBorderDark: '#3A3C52',         // Card border for dark mode
  
  // ⚠️ MACRO COLORS - DO NOT CHANGE THESE! ⚠️
  // These colors are used for macro bars and must remain exactly as they are
  protein: '#EF4444',                // Red - DO NOT CHANGE
  carbs: '#3B82F6',                  // Blue - DO NOT CHANGE
  fats: '#F59E0B',                   // Orange/Amber - DO NOT CHANGE
  fiber: '#10B981',                  // Green - DO NOT CHANGE
  calories: '#8B5CF6',               // Purple - DO NOT CHANGE
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  small: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
};

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryBackground,
  },
  containerDark: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.06)',
    elevation: 2,
  },
  cardDark: {
    backgroundColor: colors.cardDark,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorderDark,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 2,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.primaryText,
  },
  inputDark: {
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.textDark,
  },
});
