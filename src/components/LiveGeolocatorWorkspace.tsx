import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { ArrowLeft, Clock, MapPin, Navigation, Store, Truck } from 'lucide-react';
import { useRealtimeGeolocator } from '../hooks/useRealtimeGeolocator';
import { subscribePublicFoodcarts } from '../services/foodcartService';
import { Foodcart, WorkspaceMode } from '../types';
import { formatCountdown, formatDistance, getDistanceMeters } from '../utils/geo';
import { InteractiveDistrictMap, PlaceSearchInput } from './MapComponents';
import { RealtimeGeolocatorPanel } from './RealtimeGeolocatorPanel';

interface LiveGeolocatorWorkspaceProps {
  user: User | null;
  onReturnToRoleSelect: () => void;
  onSwitchMode: (mode: Exclude<WorkspaceMode, 'landing' | 'geolocator'>) => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const LiveGeolocatorWorkspace: React.FC<LiveGeolocatorWorkspaceProps> = ({
  user,
  onReturnToRoleSelect,
  onSwitchMode,
  onSignIn,
  onSignOut,
}) => {
  const geolocator = useRealtimeGeolocator({
    autoReverseGeocode: true,
    maxTrailPoints: 80,
  });

  const [autoCenter, setAutoCenter] = useState(true);
  const [carts, setCarts] = useState<Foodcart[]>([]);
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [radiusMeters, setRadiusMeters] = useState<number>(3218);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsub = subscribePublicFoodcarts((list) => setCarts(list));
    return () => unsub();
  }, []);

  const nearbyCarts = useMemo(() => {
    return carts
      .map((cart) => {
        const distanceMeters = getDistanceMeters(geolocator.coords, {
          lat: cart.currentLat,
          lng: cart.currentLng,
        });
        const countdown = formatCountdown(cart.timerExpiresAtMs, nowMs);
        return {
          cart,
          distanceMeters,
          countdown,
          isActivelyLive: cart.isLive && !countdown.isExpired,
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [carts, geolocator.coords, nowMs]);

  const withinRadiusCount = useMemo(
    () => nearbyCarts.filter((c) => c.distanceMeters <= radiusMeters).length,
    [nearbyCarts, radiusMeters]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={onReturnToRoleSelect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Role Select</span>
            </button>
            <span className="font-display font-bold text-base sm:text-lg text-slate-900 truncate">
              Industrial Foodcarts · Live Geolocator
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSwitchMode('customer')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Navigation className="w-3.5 h-3.5 text-orange-600" />
              <span>Customer Radar</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('owner')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Truck className="w-3.5 h-3.5 text-slate-700" />
              <span>Owner Console</span>
            </button>

            {user ? (
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 whitespace-nowrap"
              >
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onSignIn()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-[1600px] w-full mx-auto grid lg:grid-cols-12 gap-4 p-4 sm:p-6">
        <aside className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4 max-h-[calc(100vh-110px)] overflow-y-auto pr-1">
          <RealtimeGeolocatorPanel
            geolocator={geolocator}
            title="Live GPS Telemetry"
            subtitle="Real-time watchPosition stream, directional heading, and street lock"
            autoCenter={autoCenter}
            onToggleAutoCenter={setAutoCenter}
          />

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-semibold text-sm text-slate-900">
                Origin Override &amp; Scan Radius
              </span>
              <span className="font-mono font-semibold text-orange-600">
                {formatDistance(radiusMeters)} ({withinRadiusCount} carts)
              </span>
            </div>

            <PlaceSearchInput
              placeholder="Jump geolocator reference to address..."
              onPlaceSelect={({ address, location }) => {
                geolocator.setManualPosition(location, address);
              }}
            />

            <input
              type="range"
              min={400}
              max={16093}
              step={200}
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              aria-label="Geolocator scan radius in meters"
              className="w-full accent-orange-600"
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                <Store className="w-4 h-4 text-orange-600" />
                <span>Live Distance to District Carts</span>
              </h3>
              <span className="font-mono text-xs text-slate-500">{nearbyCarts.length} listed</span>
            </div>

            {nearbyCarts.length === 0 ? (
              <p className="text-xs text-slate-500">
                No foodcarts are currently listed. Open Customer Radar or Owner Console to seed or
                register carts.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {nearbyCarts.map(({ cart, distanceMeters, countdown, isActivelyLive }) => {
                  const inRange = distanceMeters <= radiusMeters;
                  return (
                    <button
                      key={cart.id}
                      type="button"
                      onClick={() => setSelectedCartId(cart.id)}
                      className={`w-full py-2.5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-lg transition-colors ${
                        selectedCartId === cart.id ? 'bg-slate-100' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {cart.name}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span>{cart.currentPlaceName || cart.cuisine}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono text-xs font-semibold ${
                            inRange ? 'text-orange-600' : 'text-slate-600'
                          }`}
                        >
                          {formatDistance(distanceMeters)}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{isActivelyLive ? countdown.label.split(' ')[0] : 'Offline'}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="lg:col-span-7 xl:col-span-8 min-h-[520px] lg:h-[calc(100vh-110px)]">
          <InteractiveDistrictMap
            center={geolocator.coords}
            zoom={15}
            autoPan={autoCenter}
            customerLocation={geolocator.coords}
            radiusMeters={radiusMeters}
            geolocatorAccuracyMeters={geolocator.accuracyMeters}
            geolocatorHeadingDeg={geolocator.headingDeg}
            geolocatorTrail={geolocator.trail}
            isGeolocatorStreaming={geolocator.isWatching}
            carts={carts}
            selectedCartId={selectedCartId}
            nowMs={nowMs}
            onSelectCart={(cart) => setSelectedCartId(cart.id)}
            onMapClick={(coords) => {
              geolocator.setManualPosition(coords);
              void geolocator.reverseGeocode(coords);
            }}
          />
        </section>
      </div>
    </div>
  );
};
