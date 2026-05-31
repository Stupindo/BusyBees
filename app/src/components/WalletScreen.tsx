import { useState, useEffect } from 'react';
import { useFamily } from '../contexts/FamilyContext';
import { supabase } from '../lib/supabase';

interface TransactionMetadata {
  week_start_date: string;
  base_allowance: number;
  penalty_sum: number;
  unfinished_mandatory_count: number;
  bonus_reward: number;
  completed_backlog_count: number;
}

interface Transaction {
  id: number;
  amount: number;
  type: 'earning' | 'penalty' | 'payout';
  description: string;
  created_at: string;
  metadata?: TransactionMetadata | null;
}

const WalletScreen = () => {
  const { activeMember } = useFamily();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Redemption state
  const [currencyRate, setCurrencyRate] = useState<number>(10);
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
  const [redeemGems, setRedeemGems] = useState<number>(0);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState<number | null>(null);

  useEffect(() => {
    if (!activeMember?.id) return;
    setIsLoading(true);
    
    // Fetch currency rate
    if (activeMember.family_id) {
      supabase
        .from('family_settings')
        .select('currency_rate')
        .eq('family_id', activeMember.family_id)
        .single()
        .then(({ data }) => {
          if (data?.currency_rate) setCurrencyRate(data.currency_rate);
        });
    }

    fetchTransactions();
  }, [activeMember?.id, activeMember?.family_id]);

  const fetchTransactions = () => {
    supabase
      .from('transactions')
      .select('id, amount, type, description, metadata, created_at')
      .eq('member_id', activeMember?.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTransactions((data || []) as Transaction[]);
        setIsLoading(false);
      });
  };

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

  const handleRedeem = async () => {
    if (!activeMember?.id || redeemGems <= 0 || redeemGems > balance) return;
    
    setIsRedeeming(true);
    const cashAmount = redeemGems / currencyRate;
    
    const { data, error } = await supabase.rpc('request_payout', {
      p_member_id: activeMember.id,
      p_gem_cost: redeemGems,
      p_cash_amount: cashAmount
    });
    
    setIsRedeeming(false);
    
    if (error) {
      alert('Failed to request payout: ' + error.message);
    } else if ((data as any)?.error) {
      alert((data as any).error);
    } else {
      setIsRedeemModalOpen(false);
      setRedeemGems(0);
      fetchTransactions();
      alert('Payout requested successfully!');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
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
        
        {/* Redeem Button (only show if balance > 0) */}
        {!isLoading && balance > 0 && (
          <button
            onClick={() => {
              setRedeemGems(Math.min(10, balance));
              setIsRedeemModalOpen(true);
            }}
            className="mt-6 bg-white text-accent font-bold py-2 px-6 rounded-full shadow-md hover:bg-stone-50 transition-colors text-sm"
          >
            💵 Redeem Cash
          </button>
        )}
      </div>

      {/* Transaction history */}
      {!isLoading && transactions.length > 0 && (
        <div>
          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3 px-1">History</p>
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
            <ul className="divide-y divide-stone-50">
              {transactions.map(t => (
                <li 
                  key={t.id} 
                  className={`px-5 py-4 flex flex-col gap-2 ${t.metadata ? 'cursor-pointer hover:bg-stone-50/50 transition-colors' : ''}`}
                  onClick={() => {
                    if (t.metadata) {
                      setExpandedTxId(expandedTxId === t.id ? null : t.id);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 w-full">
                    <span className="text-xl flex-shrink-0">{typeIcon(t.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-secondary truncate">{t.description}</p>
                        {t.metadata && (
                          <span className="text-[10px] bg-stone-100 text-stone-500 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">
                            {expandedTxId === t.id ? 'Hide Details' : 'Details'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 font-medium">{formatDate(t.created_at)}</p>
                    </div>
                    <span className={`text-sm font-black flex-shrink-0 ${typeColor(t.type)}`}>
                      {t.type === 'earning' ? '+' : '-'}{t.amount}
                    </span>
                  </div>
                  
                  {/* Expanded Details */}
                  {expandedTxId === t.id && t.metadata && (
                    <div 
                      className="mt-1 bg-stone-50 border border-stone-100 rounded-2xl p-4 text-xs space-y-2.5 animate-fadeIn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="font-bold text-stone-400 uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1">
                        📊 Earning Breakdown
                      </p>
                      
                      <div className="flex justify-between items-center text-stone-600 font-medium">
                        <span>📅 Week Start Date</span>
                        <span className="font-bold text-secondary">{formatDate(t.metadata.week_start_date)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center text-stone-600 font-medium">
                        <span>💰 Base Weekly Allowance</span>
                        <span className="font-bold text-lime-600">+{t.metadata.base_allowance} 💎</span>
                      </div>
                      
                      {t.metadata.unfinished_mandatory_count > 0 && (
                        <div className="flex justify-between items-center text-stone-600 font-medium">
                          <span>⚠️ Unfinished Chores Penalty ({t.metadata.unfinished_mandatory_count} chores)</span>
                          <span className="font-bold text-red-500">-{t.metadata.penalty_sum} 💎</span>
                        </div>
                      )}
                      
                      {t.metadata.completed_backlog_count > 0 && (
                        <div className="flex justify-between items-center text-stone-600 font-medium">
                          <span>🌟 Backlog Chores Bonus ({t.metadata.completed_backlog_count} chores)</span>
                          <span className="font-bold text-lime-600">+{t.metadata.bonus_reward} 💎</span>
                        </div>
                      )}
                      
                      <div className="border-t border-stone-200/60 pt-2.5 flex justify-between items-center font-extrabold text-sm text-secondary">
                        <span>Total Granted</span>
                        <span className="text-lime-600 font-black">{t.amount} 💎</span>
                      </div>
                    </div>
                  )}
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

      {/* Redeem Modal */}
      {isRedeemModalOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 pb-20">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-secondary">Redeem Gems</h2>
                <button
                  onClick={() => setIsRedeemModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="bg-stone-50 rounded-2xl p-5 mb-6 text-center border border-stone-100">
                <p className="text-stone-500 text-sm font-semibold mb-1">Available Balance</p>
                <p className="text-3xl font-black text-secondary">{balance} 💎</p>
                <p className="text-stone-400 text-xs mt-2">
                  Rate: {currencyRate} Gems = $1.00
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-stone-700 mb-2">How many gems to redeem?</label>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setRedeemGems(Math.max(1, redeemGems - 10))}
                    className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-xl font-bold text-stone-600 hover:bg-stone-200 transition-colors"
                  >-10</button>
                  <input
                    type="number"
                    value={redeemGems}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setRedeemGems(Math.min(Math.max(0, val), balance));
                    }}
                    className="flex-1 h-12 bg-stone-50 border-2 border-stone-100 rounded-xl text-center text-2xl font-black text-secondary focus:border-primary focus:outline-none"
                  />
                  <button 
                    onClick={() => setRedeemGems(Math.min(balance, redeemGems + 10))}
                    className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-xl font-bold text-stone-600 hover:bg-stone-200 transition-colors"
                  >+10</button>
                </div>
                <div className="flex gap-2 mt-3">
                  <button 
                    onClick={() => setRedeemGems(Math.floor(balance / 2))}
                    className="flex-1 py-2 rounded-lg bg-stone-100 text-stone-600 text-xs font-bold hover:bg-stone-200 transition-colors"
                  >Half</button>
                  <button 
                    onClick={() => setRedeemGems(balance)}
                    className="flex-1 py-2 rounded-lg bg-stone-100 text-stone-600 text-xs font-bold hover:bg-stone-200 transition-colors"
                  >Max</button>
                </div>
              </div>

              <div className="bg-lime-50 rounded-2xl p-5 text-center border border-lime-100 mb-2">
                <p className="text-lime-700 text-sm font-semibold mb-1">You will receive</p>
                <p className="text-4xl font-black text-lime-600">{formatCurrency(redeemGems / currencyRate)}</p>
              </div>
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-100 gap-3 flex">
              <button
                onClick={() => setIsRedeemModalOpen(false)}
                className="flex-1 py-3.5 rounded-xl font-bold text-stone-500 hover:bg-stone-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRedeem}
                disabled={redeemGems <= 0 || isRedeeming}
                className="flex-1 py-3.5 rounded-xl font-bold bg-primary text-secondary hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isRedeeming ? 'Processing...' : 'Request Cash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletScreen;
