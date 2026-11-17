import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { ArrowRight, Bell, Clock, LocateFixed, MapPin, Navigation, Radio, ShoppingBag, Truck } from 'lucide-react';
import { WorkspaceMode } from '../types';
import { HERO_FLEET_IMAGE } from '../utils/geo';

interface LandingPageProps {
  user: User | null;
  onSelectRole: (role: Exclude<WorkspaceMode, 'landing'>) => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  user,
  onSelectRole,
  onSignIn,
  onSignOut,
}) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Brand wordmark — 3 concise single-line links — 1 primary action */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Industrial Foodcarts
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#roles" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Select Role
            </a>
            <a href="#capabilities" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Capabilities
            </a>
            <button
              type="button"
              onClick={() => onSelectRole('geolocator')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Live Geolocator
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                Sign Out ({user.displayName?.split(' ')[0] || 'Account'})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onSignIn()}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In with Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split Section */}
        <section id="roles" className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
          <div className="grid lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-orange-600 tracking-wide">
                  Real-Time Street Fleet &amp; Proximity Ordering
                </p>
                <h1 className="mt-3 font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.08] [text-wrap:balance]">
                  Find mobile foodcarts in your area
                </h1>
                <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-xl">
                  Industrial foodcarts connects businesses and industrial hard to find food places
                  and independent foodcart operators on a live geospatial map. Track active curb
                  stops in real time, receive proximity push alerts, request a foodcart to your
                  location, or pre-order for window pickup.
                </p>
              </div>

              {/* Primary Role Selection Stack: Customer ABOVE Foodcart Owner */}
              <div className="mt-7 flex flex-col gap-3.5">
                {/* 1. Customer (Top) */}
                <button
                  type="button"
                  onClick={() => onSelectRole('customer')}
                  className="group text-left p-5 bg-slate-900 text-white border border-slate-900 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-between gap-4 shadow-xs"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-orange-600 text-white shrink-0 mt-0.5">
                      <Navigation className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-semibold text-white">Customer</h2>
                      <p className="mt-1 text-sm text-slate-300 leading-snug">
                        Explore live foodcarts within your search radius, request a foodcart to your
                        location, and pre-order for pickup.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 rounded-lg group-hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0">
                    <span>Explore Live Map</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>

                {/* 2. Foodcart Owner (Below Customer) */}
                <button
                  type="button"
                  onClick={() => onSelectRole('owner')}
                  className="group text-left p-5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors flex items-center justify-between gap-4 shadow-xs"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-900 text-white shrink-0 mt-0.5">
                      <Truck className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-semibold text-slate-900">
                        Foodcart Owner
                      </h2>
                      <p className="mt-1 text-sm text-slate-600 leading-snug">
                        Publish your cart profile and menu, set live stop timers, toggle customer
                        location requests on or off, and approve or deny stops.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg group-hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0">
                    <span>Open Vendor Console</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => onSelectRole('geolocator')}
                className="mt-3 w-full px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-sky-500 transition-colors flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
                    <Radio className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-xs text-slate-900">
                      Real-Time Geolocator Console
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      Continuous GPS lock, accuracy radius, speed, heading, and trail radar
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-sky-700 whitespace-nowrap shrink-0">
                  Launch GPS →
                </span>
              </button>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[320px] lg:min-h-[460px] rounded-xl overflow-hidden border border-slate-200 bg-slate-200 relative">
                {!heroImgFailed ? (
                  <img
                    src={HERO_FLEET_IMAGE}
                    alt="Riveted brushed stainless steel foodcart operating in an industrial foundry yard"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-200 p-8 text-center">
                    <Truck className="w-12 h-12 text-orange-500 mb-3" />
                    <p className="font-display text-lg font-semibold">Industrial Foodcarts</p>
                    <p className="text-xs text-slate-400 mt-1">Live Mobile Kitchen Network</p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 text-white">
                  <p className="text-xs font-mono text-orange-300">
                    Live District Dispatch · Real-Time GPS &amp; Pre-Order Pickup
                  </p>
                  <p className="mt-1 text-sm text-slate-100">
                    See exact curb coordinates, active service countdowns, and scheduled stops across
                    your neighborhood.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 5-Column Capability Strip below hero split */}
          <div
            id="capabilities"
            className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden"
          >
            <div className="bg-white p-5">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
                <Clock className="w-4 h-4 text-orange-600 shrink-0" />
                <span>Live Stop Timers</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Vendors lock in a street pin and set a service countdown so diners know exactly how
                long the cart stays parked.
              </p>
            </div>
            <div className="bg-white p-5">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
                <Bell className="w-4 h-4 text-orange-600 shrink-0" />
                <span>Proximity Push Alerts</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Customers receive instant notifications whenever a favorited or nearby foodcart goes
                live within their chosen radius.
              </p>
            </div>
            <div className="bg-white p-5">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
                <MapPin className="w-4 h-4 text-orange-600 shrink-0" />
                <span>Route Scheduling</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Publish weekly multi-stop itineraries plotted on Google Maps with arrival and
                departure windows.
              </p>
            </div>
            <div className="bg-white p-5">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
                <LocateFixed className="w-4 h-4 text-orange-600 shrink-0" />
                <span>Location Requests</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Customers request a foodcart to visit their GPS pin or street address; owners toggle
                requests on or off and approve or deny each stop.
              </p>
            </div>
            <div className="bg-white p-5">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
                <ShoppingBag className="w-4 h-4 text-orange-600 shrink-0" />
                <span>Window Pre-Orders</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Order directly from a cart’s live menu and track preparation status from pending to
                ready for pickup.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
