import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GoogleOneTap from './GoogleOneTap';

describe('GoogleOneTap', () => {


  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    
    (window as any).google = {
      accounts: {
        id: {
          initialize: vi.fn(),
          renderButton: vi.fn(),
          prompt: vi.fn(),
        }
      }
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as any).google;
  });

  it('initializes Google One Tap and renders button if library is present', () => {
    render(<GoogleOneTap />);
    
    const googleAccountsId = (window as any).google.accounts.id;
    
    expect(googleAccountsId.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'test-client-id',
        use_fedcm_for_prompt: true,
      })
    );
    
    expect(googleAccountsId.renderButton).toHaveBeenCalled();
    expect(googleAccountsId.prompt).toHaveBeenCalled();
  });

  it('fails gracefully if GOOGLE_CLIENT_ID is missing', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    
    render(<GoogleOneTap />);
    
    const googleAccountsId = (window as any).google.accounts.id;
    expect(googleAccountsId.initialize).not.toHaveBeenCalled();
  });
});
