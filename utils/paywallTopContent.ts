import { premiumSource } from './premiumCheckpointContract';
import type { PremiumSource } from './premiumCheckpointContract';

type Theme = 'estimator' | 'recipes' | 'planning' | 'templates' | 'club' | 'coachMeals';
type Benefit = Readonly<{ title: string; desc: string }>;
type Copy = Readonly<{
  line1: string; line2: string; subtitle: string;
  benefits: readonly [Benefit, Benefit, Benefit];
}>;

// Every existing source is intentional. null retains the current Coach copy.
// Presentation only: no routing, entitlement, purchase or analytics side effects.
export const PAYWALL_TOP_THEMES: Readonly<Record<PremiumSource, Theme | null>> = {
  unknown: null,
  onboarding_complete: null,
  settings_upgrade: null,
  home_recipe_limit: 'recipes',
  home_ai_plan: 'planning',
  coach_preview: null,
  chatbot_upgrade: null,
  ai_meal_estimator: 'estimator',
  ai_meal_planner: 'planning',
  community_club: 'club',
  template_plan: 'templates',
  feature_gate: null,
  floating_badge: null,
  coach_daily_saved: 'coachMeals',
  coach_daily_preview: 'coachMeals',
  coach_meal_saved: 'coachMeals',
  coach_meal_preview: 'coachMeals',
  coach_conversation: 'coachMeals',
};

const COPY: Readonly<Record<'en' | 'es', Record<Theme, Copy>>> = {
  en: {
    estimator: {
      line1: 'Know Your', line2: 'Meal Better.',
      subtitle: 'Estimate your meal, review the details and make it part of your day.',
      benefits: [
        { title: 'Photo or Description', desc: 'Use your camera, a saved photo or a meal description.' },
        { title: 'Calories & Macros', desc: 'Get an AI estimate to help understand your meal.' },
        { title: 'Review Before You Log', desc: 'Edit the details before adding food to your diary.' },
      ],
    },
    recipes: {
      line1: 'Find Your', line2: 'Next Meal.',
      subtitle: 'Keep exploring recipes and find ideas that fit your day.',
      benefits: [
        { title: 'Keep Exploring', desc: 'Browse without the free daily recipe-view limit.' },
        { title: 'See the Details', desc: 'Review ingredients and nutrition before you choose.' },
        { title: 'More Meal Ideas', desc: 'Find recipes to bring variety to your routine.' },
      ],
    },
    planning: {
      line1: 'Plan Your', line2: 'Meals Ahead.',
      subtitle: 'Bring your goals and food preferences into your meal plan.',
      benefits: [
        { title: 'Plans for Your Goals', desc: 'Create meal plans around your nutrition targets.' },
        { title: 'Your Food Preferences', desc: 'Include your preferences when building your plan.' },
        { title: 'Ready to Shop', desc: 'Generate a grocery list from your meal plan.' },
      ],
    },
    templates: {
      line1: 'Make This', line2: 'Plan Yours.',
      subtitle: 'Turn a meal plan template into a plan for your goals.',
      benefits: [
        { title: 'A Starting Point', desc: 'Explore the meals in your chosen template.' },
        { title: 'Choose Your Protein', desc: 'Review protein choices and portions for your goals.' },
        { title: 'Save Your Plan', desc: 'Add the plan to My Plans when you are ready.' },
      ],
    },
    club: {
      line1: 'Join Your', line2: 'Premium Club.',
      subtitle: 'Share the journey with the Macro Goal Premium community.',
      benefits: [
        { title: 'Premium Club Access', desc: 'Join the private space for Premium members.' },
        { title: 'Share Your Progress', desc: 'Share updates and celebrate progress together.' },
        { title: 'Support Along the Way', desc: 'Connect with members working on their goals.' },
      ],
    },
    coachMeals: {
      line1: 'Choose Your', line2: 'Next Meal.',
      subtitle: 'Talk through your food choices with your AI Coach.',
      benefits: [
        { title: 'Talk Through Choices', desc: 'Get guidance for cooking, quick meals or eating out.' },
        { title: 'Review Your Portions', desc: 'Compare meal options and review portions.' },
        { title: 'Log When Ready', desc: 'Review your meal before adding it to your diary.' },
      ],
    },
  },
  es: {
    estimator: {
      line1: 'Conoce Tu', line2: 'Comida Mejor.',
      subtitle: 'Estima tu comida, revisa los detalles y añádela a tu día.',
      benefits: [
        { title: 'Foto o Descripción', desc: 'Usa la cámara, una foto guardada o describe tu comida.' },
        { title: 'Calorías y Macros', desc: 'Obtén una estimación con IA para conocer tu comida.' },
        { title: 'Revisa y Registra', desc: 'Edita los detalles antes de añadirla a tu diario.' },
      ],
    },
    recipes: {
      line1: 'Encuentra Tu', line2: 'Próxima Comida.',
      subtitle: 'Sigue explorando recetas y encuentra ideas para tu día.',
      benefits: [
        { title: 'Sigue Explorando', desc: 'Explora sin el límite diario de recetas del plan gratis.' },
        { title: 'Mira los Detalles', desc: 'Revisa ingredientes y nutrientes antes de elegir.' },
        { title: 'Más Ideas de Comidas', desc: 'Encuentra recetas para darle variedad a tu rutina.' },
      ],
    },
    planning: {
      line1: 'Organiza Tus', line2: 'Comidas.',
      subtitle: 'Crea un plan de comidas según tus metas y preferencias.',
      benefits: [
        { title: 'Planes para Tus Metas', desc: 'Crea planes según tus objetivos de nutrición.' },
        { title: 'Tus Preferencias', desc: 'Incluye tus preferencias al crear tu plan.' },
        { title: 'Prepara Tu Compra', desc: 'Genera una lista de compras desde tu plan.' },
      ],
    },
    templates: {
      line1: 'Haz Tuyo', line2: 'Este Plan.',
      subtitle: 'Convierte una plantilla en un plan para tus objetivos.',
      benefits: [
        { title: 'Un Punto de Partida', desc: 'Explora las comidas de la plantilla que elegiste.' },
        { title: 'Elige Tu Proteína', desc: 'Revisa proteínas y porciones según tus objetivos.' },
        { title: 'Guarda Tu Plan', desc: 'Añade el plan a Mis Planes cuando estés listo.' },
      ],
    },
    club: {
      line1: 'Únete a Tu', line2: 'Club Premium.',
      subtitle: 'Comparte el camino con la comunidad Premium de Macro Goal.',
      benefits: [
        { title: 'Acceso al Club Premium', desc: 'Entra al espacio privado para miembros Premium.' },
        { title: 'Comparte Tu Progreso', desc: 'Comparte novedades y celebren juntos sus avances.' },
        { title: 'Apoyo en el Camino', desc: 'Conecta con miembros que trabajan en sus metas.' },
      ],
    },
    coachMeals: {
      line1: 'Elige Tu', line2: 'Próxima Comida.',
      subtitle: 'Habla con tu Coach de IA sobre tus opciones de comida.',
      benefits: [
        { title: 'Explora Tus Opciones', desc: 'Recibe ideas para cocinar o comer fuera o rápido.' },
        { title: 'Revisa Tus Porciones', desc: 'Compara opciones de comidas y revisa las porciones.' },
        { title: 'Registra a Tu Ritmo', desc: 'Revisa tu comida antes de añadirla a tu diario.' },
      ],
    },
  },
};

/** Stateless lookup: each render uses the current route source and app language. */
export function getPaywallTop(source: unknown, language?: string): Copy | null {
  const theme = PAYWALL_TOP_THEMES[premiumSource(source)];
  if (!theme) return null;
  const locale = /^es(?:[-_]|$)/i.test(language ?? '') ? 'es' : 'en';
  return COPY[locale][theme];
}
