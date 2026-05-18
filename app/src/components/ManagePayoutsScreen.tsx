import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFamily } from '../contexts/FamilyContext';
import { supabase } from '../lib/supabase';

interface Redemption {
  id: number;
  member_id: number;
  gem_cost: number;
  cash_amount: number;
  created_at: string;
  members: {
    custom_name: string | null;
    avatar: string | null;
  } | null;
}

const ManagePayoutsScreen = () => {
  const { activeFamily } = useFamily();
  const navigate = useNavigate();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);

  useEffect(() => {
    fetchRedemptions();
  }, [activeFamily?.id]);

  const fetchRedemptions = async () => {
    if (!activeFamily?.id) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('reward_redemptions')
      .select('id, member_id, gem_cost, cash_amount, created_at, members(custom_name, avatar)')
      .eq('family_id', activeFamily.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching redemptions:', error);
      alert('Failed to load payout requests: ' + error.message);
    } else if (data) {
      setRedemptions(data as unknown as Redemption[]);
    }
    setIsLoading(false);
  };

  const handleProcess = async (id: number, status: 'approved' | 'declined') => {
    if (!confirm(`Are you sure you want to mark this payout as ${status}?`)) return;
    
    setProcessingId(id);
    const { data, error } = await supabase.rpc('process_payout', {
      p_redemption_id: id,
      p_status: status
    });
    setProcessingId(null);

    if (error) {
      alert('Failed to process payout: ' + error.message);
    } else if ((data as any)?.error) {
      alert((data as any).error);
    } else {
      setRedemptions((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const getMemberName = (r: Redemption) => {
    if (!r.members) return 'Unknown Member';
    return r.members.custom_name || 'Member';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <div className="p-6 pt-10 pb-28">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/settings')}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
        >
          ←
        </button>
        <div>
          <h1 className="text-3xl font-extrabold text-secondary tracking-tight mb-1">Payout Requests</h1>
          <p className="text-stone-500 font-medium text-sm">Review pending cash out requests.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-10 h-10 border-4 border-stone-200 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : redemptions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-10 flex flex-col items-center text-center">
          <span className="text-5xl mb-4">💸</span>
          <h2 className="text-lg font-bold text-secondary mb-2">No pending payouts</h2>
          <p className="text-stone-500 font-medium text-sm">You are all caught up! There are no cash out requests waiting to be reviewed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {redemptions.map((r) => (
            <div key={r.id} className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-2xl">
                  {r.members?.avatar || '🌟'}
                </div>
                <div className="flex-1">
                  <p className="text-lg font-bold text-secondary">{getMemberName(r)}</p>
                  <p className="text-sm font-medium text-stone-400">
                    Requested on {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="bg-stone-50 rounded-2xl p-4 mb-4 border border-stone-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Cash Out</p>
                  <p className="text-2xl font-black text-lime-600">{formatCurrency(r.cash_amount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1">Cost</p>
                  <p className="text-xl font-bold text-stone-700">{r.gem_cost} 💎</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleProcess(r.id, 'declined')}
                  disabled={processingId === r.id}
                  className="flex-1 py-3 rounded-xl font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  onClick={() => handleProcess(r.id, 'approved')}
                  disabled={processingId === r.id}
                  className="flex-1 py-3 rounded-xl font-bold bg-primary text-secondary hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {processingId === r.id ? 'Saving...' : 'Approve & Pay'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ManagePayoutsScreen;
