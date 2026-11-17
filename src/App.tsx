import { useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { CustomerWorkspace } from './components/CustomerWorkspace';
import { LandingPage } from './components/LandingPage';
import { LiveGeolocatorWorkspace } from './components/LiveGeolocatorWorkspace';
import { OwnerWorkspace } from './components/OwnerWorkspace';
import { auth, googleProvider } from './firebase';
import { ensureUserProfile } from './services/foodcartService';
import { WorkspaceMode } from './types';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export default function App() {
  const [mode, setMode] = useState<WorkspaceMode>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [selectedNationality, setSelectedNationality] = useState<string>('All');

  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        const pref = mode === 'owner' ? 'owner' : 'customer';
        await ensureUserProfile(
          cred.user.uid,
          cred.user.displayName || cred.user.email?.split('@')[0] || 'User',
          pref
        );
      }
    } catch (err) {
      console.error('Google sign-in failed:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out failed:', err);
    }
  };

  const handleSelectRole = (nextRole: Exclude<WorkspaceMode, 'landing'>) => {
    setMode(nextRole);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      libraries={['marker', 'places', 'routes']}
      language="en"
      region="US"
    >
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {!authReady ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-xs font-medium text-slate-600">
          Initializing Industrial Foodcarts...
        </div>
      ) : mode === 'landing' ? (
        <LandingPage
          user={user}
          onSelectRole={handleSelectRole}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      ) : mode === 'geolocator' ? (
        <LiveGeolocatorWorkspace
          user={user}
          onReturnToRoleSelect={() => setMode('landing')}
          onSwitchMode={(next) => setMode(next)}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      ) : mode === 'owner' ? (
        <OwnerWorkspace
          user={user}
          onReturnToRoleSelect={() => setMode('landing')}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      ) : (
        <CustomerWorkspace
          user={user}
          selectedNationality={selectedNationality}
          onSelectNationality={setSelectedNationality}
          onReturnToRoleSelect={() => setMode('landing')}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onSwitchToOwner={() => setMode('owner')}
        />
      )}
    </APIProvider>
  );
}
