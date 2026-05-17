import { useState, useEffect, useCallback } from 'react';
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
import HiveReportScreen from './components/HiveReportScreen';
import WalletScreen from './components/WalletScreen';
import SettingsScreen from './components/SettingsScreen';
import { supabase } from './lib/supabase';


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
        <Route path="wallet" element={<WalletScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="settings/members" element={<ManageMembersScreen />} />
        <Route path="settings/templates" element={<ChoreTemplatesScreen />} />
        <Route path="settings/templates/:templateId" element={<EditTemplateScreen />} />
        <Route path="settings/report" element={<HiveReportScreen />} />
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
