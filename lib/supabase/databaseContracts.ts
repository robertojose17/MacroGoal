import type { Database } from './types';
// pg-meta cannot represent nullable RPC arguments. These exact installed RPCs
// explicitly accept null CAS timestamps/absent initial goal; all args stay required.
type Save = Database['public']['Functions']['save_accepted_nutrition_goal_v1'];
type Restart = Database['public']['Functions']['restart_accepted_nutrition_journey_v1'];
export type AppDatabase = Omit<Database, 'public'> & { public: Omit<Database['public'], 'Functions'> & {
  Functions: Omit<Database['public']['Functions'], 'save_accepted_nutrition_goal_v1' | 'restart_accepted_nutrition_journey_v1'> & {
    save_accepted_nutrition_goal_v1: Omit<Save, 'Args'> & { Args: Omit<Save['Args'], 'p_expected_goal_id' | 'p_expected_updated_at' | 'p_expected_profile_updated_at' | 'p_operation'> & {
      p_expected_goal_id: string | null; p_expected_updated_at: string | null; p_expected_profile_updated_at: string | null;
      p_operation: 'initial_onboarding' | 'manual_goal';
    }};
    restart_accepted_nutrition_journey_v1: Omit<Restart, 'Args'> & { Args: Omit<Restart['Args'], 'p_expected_goal_updated_at' | 'p_expected_profile_updated_at'> & {
      p_expected_goal_updated_at: string | null; p_expected_profile_updated_at: string | null;
    }};
  };
}};
