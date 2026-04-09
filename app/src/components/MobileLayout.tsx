import { Outlet, NavLink } from 'react-router-dom';
import { Home, Wallet, Settings } from 'lucide-react';

export default function MobileLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-stone-50 font-sans text-secondary">
      {/* Main Content Area */}
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      {/* Sticky Bottom Navigation Bar */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-stone-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe z-50">
        <div className="flex justify-around items-center h-16">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full transition-colors duration-200 ${
                isActive ? 'text-primary-dark font-semibold' : 'text-stone-400 hover:text-stone-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Home className={`w-6 h-6 mb-1 transition-transform duration-200 ${isActive ? 'scale-110 text-primary' : ''}`} />
                <span className="text-[10px] uppercase tracking-wider">Dashboard</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/wallet"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full transition-colors duration-200 ${
                isActive ? 'text-primary-dark font-semibold' : 'text-stone-400 hover:text-stone-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Wallet className={`w-6 h-6 mb-1 transition-transform duration-200 ${isActive ? 'scale-110 text-primary' : ''}`} />
                <span className="text-[10px] uppercase tracking-wider">Gems</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full transition-colors duration-200 ${
                isActive ? 'text-primary-dark font-semibold' : 'text-stone-400 hover:text-stone-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Settings className={`w-6 h-6 mb-1 transition-transform duration-200 ${isActive ? 'scale-110 text-primary' : ''}`} />
                <span className="text-[10px] uppercase tracking-wider">Settings</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
