import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoginScreen from './LoginScreen';

// Mock the nested GoogleOneTap since we are just testing the static wrapper here
vi.mock('./GoogleOneTap', () => ({
  default: () => <div data-testid="google-one-tap-mock">Google Button Here</div>
}));

describe('LoginScreen', () => {
  it('renders title and visual components properly', () => {
    render(<LoginScreen />);
    
    expect(screen.getByText('BusyBees')).toBeInTheDocument();
    expect(screen.getByText('Sign in to join the hive and manage your family tasks.')).toBeInTheDocument();
    expect(screen.getByTestId('google-one-tap-mock')).toBeInTheDocument();
  });
});
