import { premiumSource } from './premiumCheckpointContract';
import type { PremiumSource } from './premiumCheckpointContract';

type Theme = 'estimator' | 'recipes' | 'planning' | 'templates' | 'club' | 'coachMeals' | 'general';
type Benefit = Readonly<{ title: string; desc: string }>;
type Copy = Readonly<{
  line1: string; line2: string; subtitle: string;
  benefits: readonly [Benefit, Benefit, Benefit];
}>;

// Every existing source is intentional; unknown sources use the general theme.
// Presentation only: no routing, entitlement, purchase or analytics side effects.
export const PAYWALL_TOP_THEMES: Readonly<Record<PremiumSource, Theme>> = {
  "unknown": "general",
  "onboarding_complete": "general",
  "settings_upgrade": "general",
  "home_recipe_limit": "recipes",
  "home_ai_plan": "planning",
  "coach_preview": "general",
  "chatbot_upgrade": "general",
  "ai_meal_estimator": "estimator",
  "ai_meal_planner": "planning",
  "community_club": "club",
  "template_plan": "templates",
  "feature_gate": "general",
  "floating_badge": "general",
  "coach_daily_saved": "coachMeals",
  "coach_daily_preview": "coachMeals",
  "coach_meal_saved": "coachMeals",
  "coach_meal_preview": "coachMeals",
  "coach_conversation": "coachMeals"
};

// Benefit-led copy hypotheses; conversion gains have not been established.
const COPY: Readonly<Record<'en' | 'es', Record<Theme, Copy>>> = {
  "en": {
    "estimator": {
      "line1": "Stop guessing",
      "line2": "what’s on your plate.",
      "subtitle": "Understand your meals without searching for every ingredient.",
      "benefits": [
        {
          "title": "Less manual work",
          "desc": "Get a nutrition estimate from a photo or description, without entering every ingredient."
        },
        {
          "title": "More informed choices",
          "desc": "See estimated calories and macros to understand how your meal fits into your day."
        },
        {
          "title": "A log that reflects you",
          "desc": "Adjust the estimate to your actual meal, so your journal reflects what you ate."
        }
      ]
    },
    "recipes": {
      "line1": "Break out of",
      "line2": "your meal rut.",
      "subtitle": "Find fresh ideas for meals you look forward to.",
      "benefits": [
        {
          "title": "More variety, less boredom",
          "desc": "Discover different recipes to bring fresh ideas into your everyday meals."
        },
        {
          "title": "Choices that make sense",
          "desc": "See ingredients and nutrition details to decide what works for you."
        },
        {
          "title": "Explore beyond one recipe",
          "desc": "Open more recipes without the free plan’s daily viewing limit."
        }
      ]
    },
    "planning": {
      "line1": "Stop wondering",
      "line2": "what to eat.",
      "subtitle": "Give your meals a plan that fits you.",
      "benefits": [
        {
          "title": "Fewer last-minute decisions",
          "desc": "Know what’s on your plan instead of starting from scratch at every meal."
        },
        {
          "title": "Food that fits you",
          "desc": "Get a meal plan shaped around your nutrition goals and food preferences."
        },
        {
          "title": "More organized grocery trips",
          "desc": "Bring a shopping list based on your plan, so you know what to buy."
        }
      ]
    },
    "templates": {
      "line1": "A meal plan.",
      "line2": "Not a blank page.",
      "subtitle": "Start with a ready-made structure and make it yours.",
      "benefits": [
        {
          "title": "A head start",
          "desc": "Build on an existing plan instead of figuring out every meal yourself."
        },
        {
          "title": "A better personal fit",
          "desc": "Choose protein options and portions that suit your goals within your selected plan."
        },
        {
          "title": "Your plan, ready to revisit",
          "desc": "Keep your customized plan in My Plans whenever you need a starting point."
        }
      ]
    },
    "club": {
      "line1": "You don’t have to",
      "line2": "do this alone.",
      "subtitle": "Connect with people working on their goals, like you.",
      "benefits": [
        {
          "title": "A place to belong",
          "desc": "Find a members-only space to share the everyday ups and downs of your journey."
        },
        {
          "title": "Progress worth sharing",
          "desc": "Celebrate your wins with a community working toward its own goals."
        },
        {
          "title": "Encouragement along the way",
          "desc": "Exchange experiences with other members and find inspiration in their progress."
        }
      ]
    },
    "coachMeals": {
      "line1": "Your next meal,",
      "line2": "with less guesswork.",
      "subtitle": "Get AI guidance for the choices in front of you.",
      "benefits": [
        {
          "title": "Ideas for real life",
          "desc": "Find meal ideas whether you’re cooking, eating out, or grabbing something quick."
        },
        {
          "title": "Clearer portion choices",
          "desc": "Get portion guidance to help choose a meal that fits your goals."
        },
        {
          "title": "Less effort to keep track",
          "desc": "Bring your meal into your food journal after reviewing the details."
        }
      ]
    },
    "general": {
      "line1": "Your goal",
      "line2": "deserves a plan.",
      "subtitle": "Bring your meals and goals together with personalized AI guidance.",
      "benefits": [
        {
          "title": "Less uncertainty around food",
          "desc": "Get AI guidance to help make sense of your everyday food choices."
        },
        {
          "title": "A clearer plan for meals",
          "desc": "Bring structure to your eating with personalized plans, recipes, and shopping lists."
        },
        {
          "title": "Guidance that can evolve",
          "desc": "Adjust your approach as your goals, preferences, and progress change."
        }
      ]
    }
  },
  "es": {
    "estimator": {
      "line1": "Deja de adivinar",
      "line2": "lo que comes.",
      "subtitle": "Entiende tus comidas sin buscar cada ingrediente.",
      "benefits": [
        {
          "title": "Menos trabajo manual",
          "desc": "Obtén una estimación nutricional con una foto o descripción, sin ingresar cada ingrediente."
        },
        {
          "title": "Decisiones mejor informadas",
          "desc": "Conoce las calorías y macros estimados para entender cómo encaja tu comida en el día."
        },
        {
          "title": "Un registro a tu medida",
          "desc": "Ajusta la estimación a tu comida real para que tu diario refleje lo que comiste."
        }
      ]
    },
    "recipes": {
      "line1": "Come variado.",
      "line2": "Sin complicarte.",
      "subtitle": "Encuentra ideas nuevas para disfrutar más tus comidas.",
      "benefits": [
        {
          "title": "Más variedad, menos monotonía",
          "desc": "Descubre recetas diferentes para renovar tus comidas de todos los días."
        },
        {
          "title": "Elige lo que te conviene",
          "desc": "Consulta ingredientes e información nutricional para decidir qué funciona para ti."
        },
        {
          "title": "Más de una receta",
          "desc": "Abre más recetas sin el límite diario de visualizaciones del plan gratis."
        }
      ]
    },
    "planning": {
      "line1": "Deja de improvisar",
      "line2": "cada comida.",
      "subtitle": "Organiza tus comidas con un plan para ti.",
      "benefits": [
        {
          "title": "Menos decisiones de último minuto",
          "desc": "Ten tus comidas planificadas sin empezar de cero cada vez que tengas hambre."
        },
        {
          "title": "Comidas que van contigo",
          "desc": "Obtén un plan basado en tus metas nutricionales y tus preferencias de comida."
        },
        {
          "title": "Compras mejor organizadas",
          "desc": "Lleva una lista basada en tu plan para saber qué necesitas comprar."
        }
      ]
    },
    "templates": {
      "line1": "Empieza con un plan,",
      "line2": "no de cero.",
      "subtitle": "Parte de una estructura lista y adáptala a ti.",
      "benefits": [
        {
          "title": "Un comienzo más fácil",
          "desc": "Aprovecha un plan existente sin tener que pensar cada comida desde cero."
        },
        {
          "title": "Más a tu medida",
          "desc": "Elige proteínas y porciones según tus metas dentro del plan seleccionado."
        },
        {
          "title": "Tu plan siempre a mano",
          "desc": "Guarda tu plan personalizado en Mis Planes para consultarlo cuando lo necesites."
        }
      ]
    },
    "club": {
      "line1": "No tienes que",
      "line2": "hacerlo solo.",
      "subtitle": "Conecta con personas que también trabajan en sus metas.",
      "benefits": [
        {
          "title": "Un espacio para ti",
          "desc": "Comparte los avances y retos de tu camino en un espacio exclusivo para miembros."
        },
        {
          "title": "Tus avances merecen celebrarse",
          "desc": "Comparte tus logros con una comunidad que también trabaja en sus metas."
        },
        {
          "title": "Motivación en el camino",
          "desc": "Intercambia experiencias con otros miembros y encuentra inspiración en sus avances."
        }
      ]
    },
    "coachMeals": {
      "line1": "Menos dudas sobre",
      "line2": "tu próxima comida.",
      "subtitle": "Recibe orientación de IA para elegir qué comer.",
      "benefits": [
        {
          "title": "Ideas para tu día real",
          "desc": "Encuentra ideas para cocinar, comer fuera o resolver una comida rápida."
        },
        {
          "title": "Más claridad con las porciones",
          "desc": "Recibe orientación sobre porciones para elegir una comida que encaje con tus metas."
        },
        {
          "title": "Más fácil llevar tu registro",
          "desc": "Añade tu comida al diario después de revisar que los detalles reflejen lo que comiste."
        }
      ]
    },
    "general": {
      "line1": "Tu meta",
      "line2": "merece un plan.",
      "subtitle": "Conecta tus comidas y metas con orientación personalizada de IA.",
      "benefits": [
        {
          "title": "Menos dudas al comer",
          "desc": "Recibe orientación de IA para entender mejor tus opciones de comida del día a día."
        },
        {
          "title": "Más orden en tus comidas",
          "desc": "Organiza tu alimentación con planes personalizados, recetas y listas de compras."
        },
        {
          "title": "Una guía que evoluciona",
          "desc": "Ajusta tu enfoque a medida que cambian tus metas, preferencias y avances."
        }
      ]
    }
  }
};

/** Stateless lookup: each render uses the current route source and app language. */
export function getPaywallTop(source: unknown, language?: string): Copy {
  const theme = PAYWALL_TOP_THEMES[premiumSource(source)];
  const locale = /^es(?:[-_]|$)/i.test(language ?? '') ? 'es' : 'en';
  return COPY[locale][theme];
}
