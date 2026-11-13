import { premiumSource } from './premiumCheckpointContract';
import type { PremiumSource } from './premiumCheckpointContract';

type Theme = 'onboarding' | 'estimator' | 'recipes' | 'planning' | 'templates' | 'club' | 'coachMeals' | 'general';
type Benefit = Readonly<{ title: string; desc: string }>;
type Copy = Readonly<{
  line1: string; line2: string; subtitle: string;
  benefits: readonly [Benefit, Benefit, Benefit];
}>;

// Every existing source is intentional; unknown sources use the general theme.
// Presentation only: no routing, entitlement, purchase or analytics side effects.
export const PAYWALL_TOP_THEMES: Readonly<Record<PremiumSource, Theme>> = {
  "unknown": "general",
  "onboarding_complete": "onboarding",
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
    "onboarding": {
      "line1": "Your Personalized Plan",
      "line2": "Starts Here",
      "subtitle": "Everything you need to turn your goals into a plan you can follow, with less guesswork along the way.",
      "benefits": [
            {
                  "title": "Know What to Eat",
                  "desc": "Meal plans and recipes built around your goals and preferences."
            },
            {
                  "title": "Make Your Plan Easier to Follow",
                  "desc": "A grocery list to help you put your meals into action."
            },
            {
                  "title": "Get Guidance Along the Way",
                  "desc": "Your AI Coach is there to answer questions and help you stay on track."
            }
      ]
},
    "estimator": {
      "line1": "Log your meal.",
      "line2": "Skip the ingredient hunt.",
      "subtitle": "Turn a photo or description into a nutrition estimate you can review.",
      "benefits": [
        {
          "title": "Less typing, less searching",
          "desc": "Get an estimate without looking up and entering every ingredient separately."
        },
        {
          "title": "Calories and macros together",
          "desc": "See estimated nutrition to understand how your meal fits into your day."
        },
        {
          "title": "Your meal, your adjustments",
          "desc": "Correct the details before logging, so your journal reflects what you actually ate."
        }
      ]
    },
    "recipes": {
      "line1": "Break out of",
      "line2": "your meal rut.",
      "subtitle": "Find your next meal without stopping at one recipe a day.",
      "benefits": [
        {
          "title": "More meals to choose from",
          "desc": "Explore recipe details beyond the free plan’s daily viewing limit."
        },
        {
          "title": "Know what you’ll need",
          "desc": "See the ingredients before choosing a recipe, so you can plan around what you have."
        },
        {
          "title": "Nutrition before you decide",
          "desc": "Check each recipe’s nutrition details to choose what fits your day."
        }
      ]
    },
    "planning": {
      "line1": "Stop wondering",
      "line2": "what to eat.",
      "subtitle": "Get a meal plan and shopping list built around your goals and preferences.",
      "benefits": [
        {
          "title": "Meals already planned",
          "desc": "Start with a meal plan instead of coming up with every meal yourself."
        },
        {
          "title": "Your preferences, built in",
          "desc": "Get meals planned around your nutrition goals and the food preferences you provide."
        },
        {
          "title": "Less work before grocery shopping",
          "desc": "Get a shopping list from your plan instead of building it from scratch."
        }
      ]
    },
    "templates": {
      "line1": "Start with a plan,",
      "line2": "not from scratch.",
      "subtitle": "Make this meal plan yours without building every meal yourself.",
      "benefits": [
        {
          "title": "Meals already mapped out",
          "desc": "Start from an existing template rather than putting an entire plan together yourself."
        },
        {
          "title": "Protein choices that suit you",
          "desc": "Choose your protein options and review the portions in your selected plan."
        },
        {
          "title": "Your plan within reach",
          "desc": "Save it to My Plans so you can return to it whenever you need."
        }
      ]
    },
    "club": {
      "line1": "You don’t have to",
      "line2": "do this alone.",
      "subtitle": "Share your journey in a private community of Premium members.",
      "benefits": [
        {
          "title": "A space beyond your journal",
          "desc": "Share your progress and everyday challenges with other members in the Premium Club."
        },
        {
          "title": "Wins worth sharing",
          "desc": "Give your milestones a place in a community working toward its own goals."
        },
        {
          "title": "Other journeys to learn from",
          "desc": "Read what other members share and exchange experiences along the way."
        }
      ]
    },
    "coachMeals": {
      "line1": "Your next meal,",
      "line2": "with less guesswork.",
      "subtitle": "Get AI meal ideas for cooking, eating out, or grabbing something quick.",
      "benefits": [
        {
          "title": "Options for where you are",
          "desc": "Get food ideas for your situation instead of starting your search from scratch."
        },
        {
          "title": "Help with portion decisions",
          "desc": "Get portion guidance to help you decide how a meal fits your goals."
        },
        {
          "title": "From meal idea to journal",
          "desc": "Review your meal’s details before adding it to your food journal."
        }
      ]
    },
    "general": {
      "line1": "Know what to eat",
      "line2": "for your goal.",
      "subtitle": "A meal plan shaped around your goals and preferences, with everyday AI guidance.",
      "benefits": [
        {
          "title": "Meals already planned",
          "desc": "Get a personalized meal plan instead of figuring out every meal yourself."
        },
        {
          "title": "Simplify your grocery shopping",
          "desc": "Get a shopping list based on your plan, so you know what to buy."
        },
        {
          "title": "Help choosing what to eat",
          "desc": "Ask your AI Coach for meal ideas and portion guidance when you need direction."
        }
      ]
    }
  },
  "es": {
    "onboarding": {
      "line1": "Tu plan personalizado",
      "line2": "empieza aquí",
      "subtitle": "Todo lo que necesitas para convertir tus metas en un plan que puedas seguir, con menos dudas en el camino.",
      "benefits": [
            {
                  "title": "Ten claro qué comer",
                  "desc": "Planes de comidas y recetas adaptados a tus metas y preferencias."
            },
            {
                  "title": "Haz que tu plan sea más fácil de seguir",
                  "desc": "Una lista de compras para ayudarte a llevar tus comidas a la práctica."
            },
            {
                  "title": "Recibe orientación en el camino",
                  "desc": "Tu coach de IA está ahí para responder tus preguntas y ayudarte a mantener el rumbo."
            }
      ]
},
    "estimator": {
      "line1": "Registra tu comida",
      "line2": "sin buscar cada ingrediente.",
      "subtitle": "Obtén una estimación nutricional con una foto o descripción y revísala antes de guardar.",
      "benefits": [
        {
          "title": "Menos búsquedas, menos escritura",
          "desc": "Obtén una estimación sin buscar e ingresar cada ingrediente por separado."
        },
        {
          "title": "Calorías y macros juntos",
          "desc": "Consulta los valores estimados para entender cómo encaja tu comida en el día."
        },
        {
          "title": "Tu comida, tus ajustes",
          "desc": "Corrige los detalles antes de guardar para que tu diario refleje lo que realmente comiste."
        }
      ]
    },
    "recipes": {
      "line1": "Come variado.",
      "line2": "Sin complicarte.",
      "subtitle": "Encuentra tu próxima comida sin quedarte en una receta al día.",
      "benefits": [
        {
          "title": "Más opciones para elegir",
          "desc": "Explora los detalles de más recetas sin el límite diario del plan gratis."
        },
        {
          "title": "Ten claros los ingredientes",
          "desc": "Revisa qué necesitas antes de elegir y aprovecha lo que ya tienes."
        },
        {
          "title": "Información antes de decidir",
          "desc": "Consulta la información nutricional de cada receta para elegir lo que encaja en tu día."
        }
      ]
    },
    "planning": {
      "line1": "Deja de improvisar",
      "line2": "cada comida.",
      "subtitle": "Obtén un plan y una lista de compras según tus metas y preferencias.",
      "benefits": [
        {
          "title": "Ten claro qué comer",
          "desc": "Parte de un plan de comidas sin tener que pensar cada comida desde cero."
        },
        {
          "title": "Tus preferencias cuentan",
          "desc": "Recibe un plan basado en tus metas nutricionales y las preferencias que indiques."
        },
        {
          "title": "Simplifica tus compras",
          "desc": "Obtén una lista basada en tu plan, sin tener que armarla desde cero."
        }
      ]
    },
    "templates": {
      "line1": "Empieza con un plan,",
      "line2": "no de cero.",
      "subtitle": "Haz tuyo este plan sin tener que armar cada comida.",
      "benefits": [
        {
          "title": "Comidas ya organizadas",
          "desc": "Parte de una plantilla existente en lugar de armar un plan completo desde cero."
        },
        {
          "title": "Proteínas que van contigo",
          "desc": "Elige tus opciones de proteína y revisa las porciones del plan seleccionado."
        },
        {
          "title": "Tu plan siempre a mano",
          "desc": "Guárdalo en Mis Planes para volver a consultarlo cuando lo necesites."
        }
      ]
    },
    "club": {
      "line1": "No tienes que",
      "line2": "hacerlo solo.",
      "subtitle": "Comparte tu camino en una comunidad privada de miembros Premium.",
      "benefits": [
        {
          "title": "Más allá de tu diario",
          "desc": "Comparte tus avances y retos cotidianos con otros miembros en el Club Premium."
        },
        {
          "title": "Un espacio para tus logros",
          "desc": "Comparte tus metas cumplidas con una comunidad que también trabaja en las suyas."
        },
        {
          "title": "Aprende de otras experiencias",
          "desc": "Lee lo que comparten otros miembros e intercambia experiencias durante el camino."
        }
      ]
    },
    "coachMeals": {
      "line1": "Menos dudas sobre",
      "line2": "tu próxima comida.",
      "subtitle": "Recibe ideas de IA para cocinar, comer fuera o resolver algo rápido.",
      "benefits": [
        {
          "title": "Opciones para tu situación",
          "desc": "Obtén ideas según dónde y cómo vas a comer, sin empezar la búsqueda desde cero."
        },
        {
          "title": "Ayuda con las porciones",
          "desc": "Recibe orientación sobre porciones para decidir cómo encaja una comida en tus metas."
        },
        {
          "title": "De la idea al diario",
          "desc": "Revisa los detalles de tu comida antes de añadirla a tu diario."
        }
      ]
    },
    "general": {
      "line1": "Ten claro qué comer",
      "line2": "para tu meta.",
      "subtitle": "Un plan según tus objetivos y preferencias, con orientación de IA para el día a día.",
      "benefits": [
        {
          "title": "Ten claro qué comer",
          "desc": "Obtén un plan personalizado sin tener que pensar cada comida desde cero."
        },
        {
          "title": "Simplifica tus compras",
          "desc": "Recibe una lista basada en tu plan para saber qué necesitas comprar."
        },
        {
          "title": "Resuelve dudas al elegir",
          "desc": "Consulta a tu Coach de IA para obtener ideas de comidas y orientación sobre porciones."
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
