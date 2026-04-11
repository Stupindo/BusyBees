import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface GoogleOneTapProps {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export default function GoogleOneTap({ onSuccess, onError }: GoogleOneTapProps) {
  const isInitialized = useRef(false);
  const buttonRef = useRef<HTMLDivElement>(null);

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
        use_fedcm_for_prompt: true, // Re-enable FedCM, but use fallback button if it fails
        cancel_on_tap_outside: false,
      });

      // Render explicit physical sign-in button as fallback
      if (buttonRef.current) {
        try {
          google.accounts.id.renderButton(buttonRef.current, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
          });
        } catch (e) {
          console.error("Failed to render Google button", e);
        }
      }

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

  return (
    <div className="w-full flex justify-center min-h-[44px]">
      <div ref={buttonRef}></div>
    </div>
  );
}
