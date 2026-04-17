import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { useFamily } from '../contexts/FamilyContext';

export default function CreateFamilyScreen() {
  const { session } = useAuth();
  const { refreshFamilies } = useFamily();
  
  const [familyName, setFamilyName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyName.trim() || !session?.user?.id) return;
    
    setIsSubmitting(true);
    setError('');

    try {
      // 1. Create the base Family record
      const { data: familyData, error: familyError } = await supabase
        .from('families')
        .insert([{ 
          name: familyName.trim(),
          created_by: session.user.id
        }])
        .select()
        .single();
        
      if (familyError) throw familyError;
      
      // 2. Create the Member mapping for the creator, assigning default 'parent' and 'admin' roles
      const { error: memberError } = await supabase
        .from('members')
        .insert([{
          user_id: session.user.id,
          family_id: familyData.id,
          role: 'parent',
          is_admin: true
        }]);
        
      if (memberError) throw memberError;

      // 3. Force the provider to resync. This will automatically select the newly generated single family
      await refreshFamilies();
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create your hive.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-stone-50 font-sans text-secondary items-center justify-center p-6 relative overflow-hidden">
       {/* Decorative Background */}
      <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-gradient-to-br from-primary-light/20 to-transparent rounded-full blur-3xl -z-10" />
      
      <div className="bg-white p-8 pb-10 rounded-3xl shadow-xl border border-stone-100 max-w-sm w-full z-10 transition-all">
        <div className="w-20 h-20 bg-gradient-to-br from-primary-light to-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner relative">
          <span className="text-4xl">👑</span>
        </div>
        
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-secondary tracking-tight mb-2">Build Your Hive</h1>
          <p className="text-stone-500 text-sm font-medium">It looks like you aren't part of any family yet. Create one to get started!</p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Hive Name</label>
            <input 
              type="text" 
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="e.g. The Smiths"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-medium text-secondary"
              required
              disabled={isSubmitting}
            />
          </div>
          
          {error && <p className="text-red-500 text-xs font-semibold text-center mt-2">{error}</p>}
          
          <button 
            type="submit" 
            disabled={isSubmitting || !familyName.trim()}
            className="w-full bg-secondary hover:bg-black text-primary-light font-bold py-4 rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {isSubmitting ? 'Building...' : 'Create Family'}
          </button>
        </form>
      </div>
    </div>
  );
}
