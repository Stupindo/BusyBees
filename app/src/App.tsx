import { Routes, Route } from 'react-router-dom';
import MobileLayout from './components/MobileLayout';

// Placeholder Pages
const Dashboard = () => (
  <div className="p-6 pt-10">
    <div className="mb-8">
      <h1 className="text-3xl font-extrabold text-secondary tracking-tight mb-1">Dashboard</h1>
      <p className="text-stone-500 font-medium text-sm">Welcome back to the hive.</p>
    </div>
    
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100 flex flex-col items-center justify-center min-h-[220px] transition-transform hover:scale-[1.01] duration-300">
      <div className="w-20 h-20 bg-gradient-to-br from-primary-light to-primary-dark rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
        <span className="text-4xl shadow-sm drop-shadow-sm">🐝</span>
      </div>
      <h3 className="text-lg font-bold text-secondary mb-1">Ready to work!</h3>
      <p className="text-stone-500 text-sm font-medium text-center">Your hive activity will appear here very soon.</p>
    </div>
  </div>
);

const Wallet = () => (
  <div className="p-6 pt-10">
    <div className="mb-8">
      <h1 className="text-3xl font-extrabold text-secondary tracking-tight mb-1">Gems</h1>
      <p className="text-stone-500 font-medium text-sm">Your rewards balance.</p>
    </div>
    
    <div className="bg-gradient-to-br from-accent to-accent-dark p-8 rounded-3xl shadow-lg border border-accent flex flex-col items-center justify-center min-h-[220px] text-white overflow-hidden relative">
      <div className="absolute top-0 right-0 p-8 opacity-20">
        <span className="text-9xl">💎</span>
      </div>
      <div className="relative z-10 flex flex-col items-center">
        <div className="text-6xl font-black drop-shadow-md mb-2">0</div>
        <p className="text-accent-100 font-semibold uppercase tracking-wider text-sm bg-black/10 px-4 py-1 rounded-full">Total Earned</p>
      </div>
    </div>
  </div>
);

const Settings = () => (
  <div className="p-6 pt-10">
    <div className="mb-8">
      <h1 className="text-3xl font-extrabold text-secondary tracking-tight mb-1">Family Setup</h1>
      <p className="text-stone-500 font-medium text-sm">Manage the hive settings.</p>
    </div>
    
    <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
      <ul className="divide-y divide-stone-100">
        <li className="p-5 flex items-center justify-between text-stone-700 font-semibold cursor-pointer hover:bg-stone-50 transition-colors group">
          <span>Manage Members</span>
          <span className="text-stone-400 group-hover:text-primary transition-colors">→</span>
        </li>
        <li className="p-5 flex items-center justify-between text-stone-700 font-semibold cursor-pointer hover:bg-stone-50 transition-colors group">
          <span>Chore Templates</span>
          <span className="text-stone-400 group-hover:text-primary transition-colors">→</span>
        </li>
        <li className="p-5 flex items-center justify-between text-stone-700 font-semibold cursor-pointer hover:bg-stone-50 transition-colors group">
          <span>App Preferences</span>
          <span className="text-stone-400 group-hover:text-primary transition-colors">→</span>
        </li>
      </ul>
    </div>
  </div>
);

function App() {
  return (
    <Routes>
      <Route path="/" element={<MobileLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
