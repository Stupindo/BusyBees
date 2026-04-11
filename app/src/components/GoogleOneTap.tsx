import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface GoogleOneTapProps {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export default function GoogleOneTap({ onSuccess, onError }: GoogleOneTapProps) {
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    
    if (!clientId || clientId.includes('your-project')) {
      console.warn('VITE_GOOGLE_CLIENT_ID is missing or default. Google One Tap will not load.');
      return;
    }

    // Google Identity Services assigns `google` to the global window object.
    const google = (window as any).google;

    if (google && google.accounts && google.accounts.id) {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          try {
            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
            });
            
            if (error) throw error;
            if (onSuccess) onSuccess();
          } catch (err) {
            console.error('Error signing in with Google One-Tap', err);
            if (onError) onError(err);
          }
        },
        use_fedcm_for_prompt: false, // Temporarily disable FedCM for local testing
        cancel_on_tap_outside: false,
      });

      google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed()) {
          console.log('Google One Tap not displayed:', notification.getNotDisplayedReason());
        }
      });
      
      isInitialized.current = true;
    } else {
      console.error('Google accounts script not loaded correctly.');
    }
  }, [onSuccess, onError]);

  return null; // One Tap renders its own overlay UI via Google script
}
