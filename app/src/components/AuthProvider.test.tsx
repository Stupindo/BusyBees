import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';

// Mock Supabase globally for this test
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    }
  }
}));

const TestComponent = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div data-testid="loading">Loading...</div>;
  return <div data-testid="user-email">{user?.email || 'No user'}</div>;
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('provides a session when the user is logged in', async () => {
    // Setup mocks to return a dummy session
    const mockSession = { user: { id: '123', email: 'test@example.com' } };
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } }
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Should initially be loading
    expect(screen.getByTestId('loading')).toBeInTheDocument();

    // Eventually loading finishes and user data is provided
    await waitFor(() => {
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });
    
    expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
  });

  it('handles sign out explicitly', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } }
    });
    (supabase.auth.signOut as any).mockResolvedValue({});

    let signOutFn: any;
    const SignOutComponent = () => {
      const { signOut, isLoading } = useAuth();
      signOutFn = signOut;
      return isLoading ? <div>Loading</div> : <div>Ready</div>;
    };

    render(
      <AuthProvider>
        <SignOutComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    await signOutFn();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
