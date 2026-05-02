import { useState } from 'react';
import { useFamily } from '../contexts/FamilyContext';
import { supabase } from '../lib/supabase';
import { RefreshCw } from 'lucide-react';

export default function ShareFamilyCode() {
  const { activeFamily, activeMember, refreshFamilies } = useFamily();
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!activeFamily || !activeFamily.join_code) {
    return null;
  }

  const isParentOrAdmin = activeMember?.role === 'parent' || activeMember?.is_admin;

  if (!isParentOrAdmin) {
    return null;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFamily.join_code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true);
      const { error } = await supabase.rpc('regenerate_family_join_code', {
        p_family_id: activeFamily.id
      });

      if (error) throw error;
      
      await refreshFamilies();
      setShowConfirm(false);
    } catch (err) {
      console.error('Error regenerating code:', err);
      alert('Failed to regenerate the family code. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100 flex flex-col mb-6">
      <div className="mb-4 flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-secondary flex items-center">
            <span className="mr-2">🐝</span> Invite to Hive
          </h3>
          <p className="text-sm font-medium text-stone-500">
            Share this code with your family members so they can join your hive.
          </p>
        </div>
        {!showConfirm && (
          <button
            onClick={() => setShowConfirm(true)}
            title="Regenerate code"
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition-colors"
          >
            <RefreshCw size={18} />
          </button>
        )}
      </div>

      {showConfirm && (
        <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
          <p className="text-sm text-red-800 font-medium mb-2">
            Are you sure you want to regenerate the join code? The old code will immediately stop working.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
              disabled={isRegenerating}
            >
              Cancel
            </button>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors flex items-center"
            >
              {isRegenerating ? (
                <>
                  <RefreshCw size={14} className="animate-spin mr-2" />
                  Regenerating...
                </>
              ) : (
                'Yes, Regenerate'
              )}
            </button>
          </div>
        </div>
      )}

      <div className="flex bg-stone-50 rounded-2xl border border-stone-200 p-2 items-center">
        <div className="flex-1 text-center font-black tracking-[0.2em] text-xl text-primary-dark">
          {activeFamily.join_code}
        </div>
        <button
          onClick={handleCopy}
          className={`px-4 py-3 rounded-xl font-bold transition-all text-sm ${
            copied 
              ? 'bg-green-100 text-green-700' 
              : 'bg-primary text-secondary hover:bg-primary-dark hover:scale-[1.02]'
          }`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
