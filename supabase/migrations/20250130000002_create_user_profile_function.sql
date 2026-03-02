
-- Create a database function to handle user profile creation
-- This function runs with SECURITY DEFINER, which means it runs with the privileges
-- of the user who created it (bypassing RLS)

CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM users WHERE id = user_id) THEN
    result := json_build_object(
      'success', true,
      'message', 'Profile already exists'
    );
    RETURN result;
  END IF;

  -- Insert the user profile
  INSERT INTO users (id, email, name, user_type, onboarding_completed)
  VALUES (user_id, user_email, user_name, 'free', false);

  result := json_build_object(
    'success', true,
    'message', 'Profile created successfully'
  );
  
  RETURN result;
EXCEPTION
  WHEN unique_violation THEN
    -- If there's a unique violation, the profile already exists
    result := json_build_object(
      'success', true,
      'message', 'Profile already exists'
    );
    RETURN result;
  WHEN OTHERS THEN
    -- Return error details
    result := json_build_object(
      'success', false,
      'error', SQLERRM
    );
    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_profile(UUID, TEXT, TEXT) TO authenticated;
