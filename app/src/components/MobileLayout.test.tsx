import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MobileLayout from './MobileLayout';

describe('MobileLayout', () => {
  it('renders the bottom navigation and children placeholders', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MobileLayout />
      </MemoryRouter>
    );

    // Assert the navigation bar items exist
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Gems')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
