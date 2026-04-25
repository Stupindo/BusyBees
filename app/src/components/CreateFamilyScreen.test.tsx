import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CreateFamilyScreen from './CreateFamilyScreen';
import { useAuth } from './AuthProvider';
import { useFamily } from '../contexts/FamilyContext';

vi.mock('./AuthProvider', () => ({
  useAuth: vi.fn(() => ({ session: { user: { id: 'user1' } } })),
  AuthProvider: ({ children }: any) => <div>{children}</div>
}));

vi.mock('../contexts/FamilyContext', () => ({
  useFamily: vi.fn(() => ({ refreshFamilies: vi.fn() })),
  FamilyProvider: ({ children }: any) => <div>{children}</div>
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

describe('CreateFamilyScreen', () => {
  beforeEach(() => {
    (useAuth as any).mockReturnValue({ session: { user: { id: 'user1' } } });
    (useFamily as any).mockReturnValue({ refreshFamilies: vi.fn() });
    vi.resetAllMocks();
  });

  it('renders in create mode by default', () => {
    render(<CreateFamilyScreen />);
    
    expect(screen.getByText('Build Your Hive')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. The Smiths')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Family' })).toBeInTheDocument();
  });

  it('switches to join mode when clicking the Join tab', () => {
    render(<CreateFamilyScreen />);
    
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    
    expect(screen.getByText('Join a Hive')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. A1B2C3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Family' })).toBeInTheDocument();
  });
});
