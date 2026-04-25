import { Routes, Route, useNavigate } from 'react-router-dom';
import MobileLayout from './components/MobileLayout';
import { AuthProvider, useAuth } from './components/AuthProvider';
import LoginScreen from './components/LoginScreen';
import { FamilyProvider, useFamily } from './contexts/FamilyContext';
import FamilySelectionScreen from './components/FamilySelectionScreen';
import CreateFamilyScreen from './components/CreateFamilyScreen';
import ShareFamilyCode from './components/ShareFamilyCode';
import ManageMembersScreen from './components/ManageMembersScreen';
import ChoreTemplatesScreen from './components/ChoreTemplatesScreen';
import EditTemplateScreen from './components/EditTemplateScreen';
import DashboardScreen from './components/DashboardScreen';

// Placeholder Pages

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

const Settings = () => {
  const { signOut } = useAuth();
  const { activeFamily } = useFamily();
  const navigate = useNavigate();
  
  return (
    <div className="p-6 pt-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-secondary tracking-tight mb-1">Family Setup</h1>
        <p className="text-stone-500 font-medium text-sm">Manage the {activeFamily?.name || ''} hive settings.</p>
      </div>

      <ShareFamilyCode />
      
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden mb-6">
        <ul className="divide-y divide-stone-100">
          <li 
            onClick={() => navigate('/settings/members')}
            className="p-5 flex items-center justify-between text-stone-700 font-semibold cursor-pointer hover:bg-stone-50 transition-colors group"
          >
            <span>Manage Members</span>
            <span className="text-stone-400 group-hover:text-primary transition-colors">→</span>
          </li>
          <li
            onClick={() => navigate('/settings/templates')}
            className="p-5 flex items-center justify-between text-stone-700 font-semibold cursor-pointer hover:bg-stone-50 transition-colors group"
          >
            <span>Chore Templates</span>
            <span className="text-stone-400 group-hover:text-primary transition-colors">→</span>
          </li>
          <li className="p-5 flex items-center justify-between text-stone-700 font-semibold cursor-pointer hover:bg-stone-50 transition-colors group">
            <span>App Preferences</span>
            <span className="text-stone-400 group-hover:text-primary transition-colors">→</span>
          </li>
        </ul>
      </div>
      
      <button 
        onClick={() => signOut()}
        className="w-full bg-stone-100 text-stone-500 font-bold py-4 rounded-2xl hover:bg-stone-200 transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
};

const FamilyGuardedApp = () => {
  const { userMemberships, activeFamily, isLoadingFamilies } = useFamily();

  if (isLoadingFamilies) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-12 h-12 border-4 border-stone-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // If the user has zero mappings, they need to create a Hive first
  if (userMemberships.length === 0) {
    return <CreateFamilyScreen />;
  }

  // If the user has mappings but hasn't activated one (or selected one), prompt them
  if (!activeFamily) {
    return <FamilySelectionScreen />;
  }

  return (
    <Routes>
      <Route path="/" element={<MobileLayout />}>
        <Route index element={<DashboardScreen />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/members" element={<ManageMembersScreen />} />
        <Route path="settings/templates" element={<ChoreTemplatesScreen />} />
        <Route path="settings/templates/:templateId" element={<EditTemplateScreen />} />
      </Route>
    </Routes>
  );
};

// Root navigator to handle auth routing wrapper
const AppNavigator = () => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-12 h-12 border-4 border-stone-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // Completely block the user with LoginScreen if there is no active session
  if (!session) {
    return <LoginScreen />;
  }

  return (
    <FamilyProvider>
      <FamilyGuardedApp />
    </FamilyProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

export default App;
