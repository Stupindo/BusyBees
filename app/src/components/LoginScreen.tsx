import GoogleOneTap from './GoogleOneTap';

export default function LoginScreen() {
  return (
    <div className="flex flex-col min-h-screen bg-stone-50 font-sans text-secondary items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-gradient-to-br from-primary-light/20 to-transparent rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[80%] h-[80%] bg-gradient-to-tl from-accent-light/10 to-transparent rounded-full blur-3xl -z-10" />

      {/* Main card */}
      <div className="bg-white p-8 pb-10 rounded-3xl shadow-xl border border-stone-100 max-w-sm w-full flex flex-col items-center text-center z-10 transition-all duration-700 ease-out translate-y-0 opacity-100">
        <div className="w-24 h-24 bg-gradient-to-br from-primary-light to-primary-dark rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner relative">
          <span className="text-5xl shadow-sm drop-shadow-sm">🐝</span>
          {/* Subtle honey drip decoration */}
          <div className="absolute -bottom-2 -right-1 w-6 h-6 bg-primary-dark rounded-full animate-bounce" style={{ animationDuration: '3s' }}></div>
          <div className="absolute -bottom-4 right-3 w-4 h-4 bg-primary-light rounded-full animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '0.2s' }}></div>
        </div>

        <h1 className="text-3xl font-black text-secondary tracking-tight mb-2">BusyBees</h1>
        <p className="text-stone-500 font-medium mb-8">Sign in to join the hive and manage your family tasks.</p>
        
        {/* Visual cue for One Tap */}
        <div className="w-full relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-4 text-stone-400 font-medium">Auto-Login via Google</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center">
          <p className="text-xs text-stone-400 max-w-[200px]">A Google prompt will appear perfectly on your screen.</p>
        </div>

        {/* The One Tap logic */}
        <GoogleOneTap />
      </div>
    </div>
  );
}
