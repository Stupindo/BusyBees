import { useState, useEffect } from 'react';
import { useFamily } from '../contexts/FamilyContext';
import { supabase } from '../lib/supabase';

interface Transaction {
  id: number;
  amount: number;
  type: 'earning' | 'penalty' | 'payout';
  description: string;
  created_at: string;
}

const WalletScreen = () => {
  const { activeMember } = useFamily();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activeMember?.id) return;
    setIsLoading(true);
    supabase
      .from('transactions')
      .select('id, amount, type, description, created_at')
      .eq('member_id', activeMember.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTransactions((data || []) as Transaction[]);
        setIsLoading(false);
      });
  }, [activeMember?.id]);

  // Balance: sum of earnings minus penalties and payouts
  const balance = transactions.reduce((sum, t) => {
    if (t.type === 'earning') return sum + t.amount;
    return sum - t.amount;
  }, 0);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const typeIcon = (type: string) => {
    if (type === 'earning') return '💎';
    if (type === 'payout') return '💸';
    return '⚠️';
  };

  const typeColor = (type: string) => {
    if (type === 'earning') return 'text-lime-600';
    return 'text-red-500';
  };

  return (
    <div className="p-6 pt-10 pb-28">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-secondary tracking-tight mb-1">Gems</h1>
        <p className="text-stone-500 font-medium text-sm">Your rewards balance.</p>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-accent to-accent-dark p-8 rounded-3xl shadow-lg border border-accent flex flex-col items-center justify-center min-h-[200px] text-white overflow-hidden relative mb-6">
        <div className="absolute top-0 right-0 p-8 opacity-20">
          <span className="text-9xl">💎</span>
        </div>
        <div className="relative z-10 flex flex-col items-center">
          {isLoading ? (
            <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mb-2" />
          ) : (
            <div className="text-6xl font-black drop-shadow-md mb-2">{balance}</div>
          )}
          <p className="text-white/80 font-semibold uppercase tracking-wider text-sm bg-black/10 px-4 py-1 rounded-full">
            Current Balance
          </p>
        </div>
      </div>

      {/* Transaction history */}
      {!isLoading && transactions.length > 0 && (
        <div>
          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3 px-1">History</p>
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
            <ul className="divide-y divide-stone-50">
              {transactions.map(t => (
                <li key={t.id} className="px-5 py-4 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">{typeIcon(t.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-secondary truncate">{t.description}</p>
                    <p className="text-xs text-stone-400 font-medium">{formatDate(t.created_at)}</p>
                  </div>
                  <span className={`text-sm font-black flex-shrink-0 ${typeColor(t.type)}`}>
                    {t.type === 'earning' ? '+' : '-'}{t.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!isLoading && transactions.length === 0 && (
        <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-8 flex flex-col items-center text-center">
          <span className="text-4xl mb-3">🐝</span>
          <p className="text-stone-500 font-semibold text-sm">No gems yet — complete your chores to earn some!</p>
        </div>
      )}
    </div>
  );
};

export default WalletScreen;
