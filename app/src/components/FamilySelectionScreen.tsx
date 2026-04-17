import { useFamily } from '../contexts/FamilyContext';

export default function FamilySelectionScreen() {
  const { userMemberships, setActiveFamilyId, isLoadingFamilies } = useFamily();

  if (isLoadingFamilies) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-12 h-12 border-4 border-stone-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-stone-50 font-sans text-secondary p-6 overflow-y-auto">
      <div className="mt-12 mb-8">
        <h1 className="text-3xl font-extrabold text-secondary tracking-tight mb-2">Select your Hive</h1>
        <p className="text-stone-500 font-medium">You belong to multiple families. Which one are we managing today?</p>
      </div>

      <div className="space-y-4 w-full max-w-sm mx-auto">
        {userMemberships.map((membership) => {
          if (!membership.families) return null;
          return (
            <button
              key={membership.id}
              onClick={() => setActiveFamilyId(membership.family_id)}
              className="w-full bg-white p-6 rounded-3xl shadow-sm border border-stone-100 flex items-center text-left hover:shadow-md hover:border-primary-light transition-all active:scale-[0.98] group"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-primary-light/50 to-primary/20 rounded-2xl flex items-center justify-center mr-5 shadow-inner">
                <span className="text-2xl">🍯</span>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-secondary mb-1 group-hover:text-primary-dark transition-colors">{membership.families.name}</h3>
                <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider bg-stone-100 px-2 py-1 rounded-full">{membership.role}</span>
              </div>
              <div className="text-stone-300 group-hover:text-primary transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
