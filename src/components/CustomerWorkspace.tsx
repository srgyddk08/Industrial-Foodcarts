import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowLeft,
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Heart,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Radio,
  Route as RouteIcon,
  Search,
  ShoppingBag,
  Sparkles,
  Square,
  Store,
  X,
} from 'lucide-react';
import { useRealtimeGeolocator } from '../hooks/useRealtimeGeolocator';
import {
  cancelCartLocationRequest,
  createCartLocationRequest,
  createPreOrder,
  seedDistrictFleet,
  subscribeCartTelemetry,
  subscribeCustomerLocationRequests,
  subscribeCustomerOrders,
  subscribeFavorites,
  subscribeMenuItems,
  subscribeProximityAlerts,
  subscribePublicFoodcarts,
  subscribeRouteStops,
  toggleFavoriteCart,
  updateOrderStatus,
} from '../services/foodcartService';
import {
  CartLocationRequest,
  FavoriteCart,
  Foodcart,
  FoodcartTelemetry,
  LatLngLiteral,
  MenuItem,
  PreOrder,
  ProximityAlert,
  RouteStop,
} from '../types';
import {
  FOOD_NATIONALITIES,
  formatAccuracy,
  formatCountdown,
  formatCurrency,
  formatDistance,
  formatHeading,
  formatSpeed,
  getCartNationality,
  getDistanceMeters,
} from '../utils/geo';
import {
  dispatchBrowserPushNotification,
  getNotificationPermission,
  PushPermissionState,
  requestBrowserNotificationPermission,
} from '../utils/notifications';
import { InteractiveDistrictMap, PlaceSearchInput } from './MapComponents';

interface CustomerWorkspaceProps {
  user: User | null;
  selectedNationality: string;
  onSelectNationality: (nationality: string) => void;
  onReturnToRoleSelect: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSwitchToOwner: () => void;
}

const RADIUS_OPTIONS = [
  { label: '0.5 mi', meters: 805 },
  { label: '1 mi', meters: 1609 },
  { label: '2 mi', meters: 3218 },
  { label: '5 mi', meters: 8047 },
  { label: '10 mi', meters: 16093 },
];

export const CustomerWorkspace: React.FC<CustomerWorkspaceProps> = ({
  user,
  selectedNationality,
  onSelectNationality,
  onReturnToRoleSelect,
  onSignIn,
  onSignOut,
  onSwitchToOwner,
}) => {
  const geolocator = useRealtimeGeolocator({
    autoReverseGeocode: true,
    maxTrailPoints: 60,
  });
  const customerLocation = geolocator.coords;
  const locationLabel = geolocator.resolvedAddress;
  const [radiusMeters, setRadiusMeters] = useState<number>(3218);

  const [carts, setCarts] = useState<Foodcart[]>([]);
  const [favorites, setFavorites] = useState<FavoriteCart[]>([]);
  const [orders, setOrders] = useState<PreOrder[]>([]);
  const [locationRequests, setLocationRequests] = useState<CartLocationRequest[]>([]);
  const [alerts, setAlerts] = useState<ProximityAlert[]>([]);

  const [filterTab, setFilterTab] = useState<'nearby' | 'all' | 'favorites'>('nearby');
  const [searchText, setSearchText] = useState('');
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [showRouteOnMap, setShowRouteOnMap] = useState(true);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [selectedCartTelemetry, setSelectedCartTelemetry] = useState<FoodcartTelemetry | null>(null);
  const [remoteTelemetryTrail, setRemoteTelemetryTrail] = useState<LatLngLiteral[]>([]);

  const [bag, setBag] = useState<Record<string, number>>({});
  const [pickupNote, setPickupNote] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<string | null>(null);

  // Location Request form state
  const [reqCoords, setReqCoords] = useState<LatLngLiteral>(customerLocation);
  const [reqLocationLabel, setReqLocationLabel] = useState<string>(locationLabel);
  const [reqTime, setReqTime] = useState<string>('Today 12:15 PM');
  const [reqPartySize, setReqPartySize] = useState<number>(8);
  const [reqNote, setReqNote] = useState<string>('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);
  const [requestStatusNotice, setRequestStatusNotice] = useState<string | null>(null);
  const prevRequestStatusRef = useRef<Record<string, CartLocationRequest['status']>>({});
  const initialRequestsLoadedRef = useRef(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [activeDrawer, setActiveDrawer] = useState<'none' | 'alerts' | 'orders' | 'requests'>('none');
  const [pushPermission, setPushPermission] = useState<PushPermissionState>(() =>
    getNotificationPermission()
  );
  const [liveToast, setLiveToast] = useState<ProximityAlert | null>(null);
  const seenAlertsRef = useRef<Set<string>>(new Set());
  const initialAlertsLoadedRef = useRef(false);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Subscribe to public listed foodcarts
  useEffect(() => {
    const unsub = subscribePublicFoodcarts(
      (list) => setCarts(list),
      (err) => setErrorMsg(err.message)
    );
    return () => unsub();
  }, []);

  // Subscribe to proximity alerts
  useEffect(() => {
    const unsub = subscribeProximityAlerts((list) => {
      setAlerts(list);
      if (!initialAlertsLoadedRef.current) {
        list.forEach((a) => seenAlertsRef.current.add(a.id));
        initialAlertsLoadedRef.current = true;
        return;
      }
      const newest = list.find((a) => !seenAlertsRef.current.has(a.id));
      if (newest) {
        list.forEach((a) => seenAlertsRef.current.add(a.id));
        const dist = getDistanceMeters(customerLocation, { lat: newest.lat, lng: newest.lng });
        const isFav = favorites.some((f) => f.cartId === newest.cartId);
        if (dist <= radiusMeters || isFav) {
          setLiveToast(newest);
          dispatchBrowserPushNotification(
            `${newest.cartName} is live nearby`,
            `${newest.placeName} (${formatDistance(dist)}) — ${newest.message}`,
            newest.id
          );
        }
      }
    });
    return () => unsub();
  }, [customerLocation, radiusMeters, favorites]);

  // Subscribe to signed-in user's favorites, pre-orders, and location requests
  useEffect(() => {
    if (!user) {
      setFavorites([]);
      setOrders([]);
      setLocationRequests([]);
      initialRequestsLoadedRef.current = false;
      prevRequestStatusRef.current = {};
      return;
    }
    const unsubFavs = subscribeFavorites(user.uid, setFavorites);
    const unsubOrders = subscribeCustomerOrders(user.uid, setOrders);
    const unsubRequests = subscribeCustomerLocationRequests(user.uid, (list) => {
      setLocationRequests(list);
      if (!initialRequestsLoadedRef.current) {
        const map: Record<string, CartLocationRequest['status']> = {};
        list.forEach((r) => {
          map[r.id] = r.status;
        });
        prevRequestStatusRef.current = map;
        initialRequestsLoadedRef.current = true;
        return;
      }
      list.forEach((r) => {
        const prev = prevRequestStatusRef.current[r.id];
        if (prev === 'pending' && (r.status === 'approved' || r.status === 'denied')) {
          const summary =
            r.status === 'approved'
              ? `${r.cartName} approved your location request for ${r.locationLabel}${r.ownerNote ? ` — "${r.ownerNote}"` : '.'}`
              : `${r.cartName} declined your location request for ${r.locationLabel}${r.ownerNote ? ` — "${r.ownerNote}"` : '.'}`;
          setRequestStatusNotice(summary);
          dispatchBrowserPushNotification(
            r.status === 'approved' ? 'Foodcart Request Approved' : 'Foodcart Request Update',
            summary,
            `req_${r.id}_${r.status}`
          );
        }
        prevRequestStatusRef.current[r.id] = r.status;
      });
    });
    return () => {
      unsubFavs();
      unsubOrders();
      unsubRequests();
    };
  }, [user]);

  // Subscribe to selected cart's menu, route stops, and live GPS telemetry
  useEffect(() => {
    if (!selectedCartId) {
      setMenuItems([]);
      setRouteStops([]);
      setSelectedCartTelemetry(null);
      setRemoteTelemetryTrail([]);
      return;
    }
    setBag({});
    setOrderFeedback(null);
    setRequestFeedback(null);
    setReqCoords(customerLocation);
    setReqLocationLabel(locationLabel);
    setRemoteTelemetryTrail([]);
    const unsubMenu = subscribeMenuItems(selectedCartId, setMenuItems);
    const unsubStops = subscribeRouteStops(selectedCartId, setRouteStops);
    const unsubTelemetry = subscribeCartTelemetry(selectedCartId, (telemetry) => {
      setSelectedCartTelemetry(telemetry);
      if (telemetry && telemetry.isStreaming) {
        const pt = { lat: telemetry.lat, lng: telemetry.lng };
        setRemoteTelemetryTrail((prev) => {
          const last = prev[prev.length - 1];
          if (last && getDistanceMeters(last, pt) < 4) return prev;
          return [...prev, pt].slice(-50);
        });
      }
    });
    return () => {
      unsubMenu();
      unsubStops();
      unsubTelemetry();
    };
  }, [selectedCartId]);

  const favoriteIds = useMemo(() => favorites.map((f) => f.cartId), [favorites]);

  const enrichedCarts = useMemo(() => {
    return carts
      .map((cart) => {
        const distanceMeters = getDistanceMeters(customerLocation, {
          lat: cart.currentLat,
          lng: cart.currentLng,
        });
        const countdown = formatCountdown(cart.timerExpiresAtMs, nowMs);
        const isActivelyLive = cart.isLive && !countdown.isExpired;
        return { cart, distanceMeters, countdown, isActivelyLive };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [carts, customerLocation, nowMs]);

  const availableNationalities = useMemo(() => {
    const set = new Set<string>(FOOD_NATIONALITIES);
    carts.forEach((c) => {
      const nat = getCartNationality(c);
      if (nat) set.add(nat);
    });
    return Array.from(set);
  }, [carts]);

  const visibleCarts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return enrichedCarts.filter(({ cart, distanceMeters }) => {
      if (filterTab === 'nearby' && distanceMeters > radiusMeters) return false;
      if (filterTab === 'favorites' && !favoriteIds.includes(cart.id)) return false;
      const cartNat = getCartNationality(cart);
      if (selectedNationality !== 'All' && cartNat !== selectedNationality) return false;
      if (
        q &&
        !cart.name.toLowerCase().includes(q) &&
        !cart.cuisine.toLowerCase().includes(q) &&
        !cartNat.toLowerCase().includes(q) &&
        !cart.currentPlaceName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [enrichedCarts, filterTab, radiusMeters, favoriteIds, selectedNationality, searchText]);

  const selectedEntry = useMemo(
    () => enrichedCarts.find((e) => e.cart.id === selectedCartId) || null,
    [enrichedCarts, selectedCartId]
  );

  const nearbyAlerts = useMemo(() => {
    return alerts.filter((a) => {
      const dist = getDistanceMeters(customerLocation, { lat: a.lat, lng: a.lng });
      return dist <= radiusMeters || favoriteIds.includes(a.cartId);
    });
  }, [alerts, customerLocation, radiusMeters, favoriteIds]);

  const handleUseGps = () => {
    geolocator.locateOnce();
  };

  const handleEnablePush = async () => {
    const result = await requestBrowserNotificationPermission();
    setPushPermission(result);
    if (result === 'granted') {
      dispatchBrowserPushNotification(
        'Industrial Foodcarts Alerts Active',
        `You will be notified when live or favorite foodcarts are within ${formatDistance(radiusMeters)}.`
      );
    }
  };

  const handleToggleFavorite = async (cart: Foodcart) => {
    if (!user) {
      await onSignIn();
      return;
    }
    const isFav = favoriteIds.includes(cart.id);
    await toggleFavoriteCart(user.uid, cart.id, cart.name, isFav);
  };

  const handleSeedFleet = async () => {
    if (!user) {
      await onSignIn();
      return;
    }
    setSeeding(true);
    setErrorMsg(null);
    try {
      await seedDistrictFleet(user.uid, customerLocation);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to seed sample fleet.');
    } finally {
      setSeeding(false);
    }
  };

  const bagItems = useMemo(() => {
    return menuItems
      .filter((item) => (bag[item.id] || 0) > 0)
      .map((item) => ({ item, qty: bag[item.id] }));
  }, [menuItems, bag]);

  const bagTotalCents = useMemo(
    () => bagItems.reduce((sum, entry) => sum + entry.item.priceCents * entry.qty, 0),
    [bagItems]
  );

  const bagCount = useMemo(
    () => bagItems.reduce((sum, entry) => sum + entry.qty, 0),
    [bagItems]
  );

  const handleSubmitPreOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;
    if (!user) {
      await onSignIn();
      return;
    }
    if (bagItems.length === 0) return;

    setSubmittingOrder(true);
    setErrorMsg(null);
    try {
      const summary = bagItems.map((b) => `${b.qty}x ${b.item.name}`).join(', ');
      await createPreOrder({
        cart: selectedEntry.cart,
        customerId: user.uid,
        customerName: user.displayName || user.email?.split('@')[0] || 'Customer',
        itemsSummary: summary,
        itemCount: bagCount,
        totalCents: bagTotalCents,
        pickupNote,
      });
      setBag({});
      setPickupNote('');
      setOrderFeedback(`Pre-order sent to ${selectedEntry.cart.name}. Track status under My Orders.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not place pre-order.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleUseRadarPinForRequest = () => {
    setReqCoords(customerLocation);
    setReqLocationLabel(locationLabel || `${customerLocation.lat.toFixed(5)}, ${customerLocation.lng.toFixed(5)}`);
  };

  const handleSubmitLocationRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;
    if (selectedEntry.cart.requestsEnabled === false) {
      setErrorMsg('This foodcart owner currently has location requests turned off.');
      return;
    }
    if (!user) {
      await onSignIn();
      return;
    }
    const cleanLabel =
      reqLocationLabel.trim() || `${reqCoords.lat.toFixed(5)}, ${reqCoords.lng.toFixed(5)}`;
    setSubmittingRequest(true);
    setErrorMsg(null);
    setRequestFeedback(null);
    try {
      await createCartLocationRequest({
        cart: selectedEntry.cart,
        customerId: user.uid,
        customerName: user.displayName || user.email?.split('@')[0] || 'Customer',
        locationLabel: cleanLabel,
        lat: reqCoords.lat,
        lng: reqCoords.lng,
        requestedTime: reqTime.trim() || 'Today Lunch',
        partySize: reqPartySize,
        note: reqNote,
      });
      setReqNote('');
      setRequestFeedback(
        `Location request sent to ${selectedEntry.cart.name}. You will see approval updates in My Requests.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send location request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const selectedCartRequests = useMemo(
    () =>
      selectedCartId ? locationRequests.filter((r) => r.cartId === selectedCartId) : [],
    [locationRequests, selectedCartId]
  );

  const pendingCustomerRequestCount = useMemo(
    () => locationRequests.filter((r) => r.status === 'pending').length,
    [locationRequests]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Workspace Top Bar with Return Option */}
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
              Industrial Foodcarts · Customer Radar
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveDrawer(activeDrawer === 'alerts' ? 'none' : 'alerts')}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Bell className="w-3.5 h-3.5 text-orange-600" />
              <span className="hidden sm:inline">Alerts</span>
              {nearbyAlerts.length > 0 && (
                <span className="font-mono text-[11px] font-semibold text-orange-600">
                  {nearbyAlerts.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveDrawer(activeDrawer === 'requests' ? 'none' : 'requests')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <LocateFixed className="w-3.5 h-3.5 text-orange-600" />
              <span className="hidden sm:inline">My Requests</span>
              {locationRequests.length > 0 && (
                <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-900">
                  {pendingCustomerRequestCount > 0
                    ? `${pendingCustomerRequestCount}/${locationRequests.length}`
                    : locationRequests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveDrawer(activeDrawer === 'orders' ? 'none' : 'orders')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-slate-700" />
              <span className="hidden sm:inline">My Orders</span>
              {orders.length > 0 && (
                <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-900">
                  {orders.length}
                </span>
              )}
            </button>

            {user ? (
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap"
              >
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onSignIn()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Live Push Notification Toast */}
      {liveToast && (
        <div className="bg-slate-900 text-white px-4 py-2.5 border-b border-slate-800">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <BellRing className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="truncate">
                <span className="font-semibold">{liveToast.cartName}</span> at{' '}
                {liveToast.placeName} — {liveToast.message}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedCartId(liveToast.cartId);
                  setLiveToast(null);
                }}
                className="text-orange-400 font-semibold hover:underline"
              >
                View Cart
              </button>
              <button
                type="button"
                onClick={() => setLiveToast(null)}
                aria-label="Dismiss notification"
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {requestStatusNotice && (
        <div className="bg-emerald-950 text-white px-4 py-2.5 border-b border-emerald-900">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <LocateFixed className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="truncate">{requestStatusNotice}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer('requests');
                  setRequestStatusNotice(null);
                }}
                className="text-orange-300 font-semibold hover:underline whitespace-nowrap"
              >
                View Requests
              </button>
              <button
                type="button"
                onClick={() => setRequestStatusNotice(null)}
                aria-label="Dismiss request notice"
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Vertical Flow: Radar & Filters -> Search Box -> Map Underneath -> Carts */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Proximity Radar & Search Filter Controls */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-sm text-slate-900">
                Proximity Radar
              </h2>
              <p className="text-xs text-slate-500 truncate max-w-md">{locationLabel}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="text-xs text-slate-600 hidden md:block mr-1">
                <span className="font-medium text-slate-800">Push Alerts:</span>{' '}
                {pushPermission === 'granted'
                  ? 'Active'
                  : pushPermission === 'denied'
                    ? 'Blocked'
                    : 'Off'}
              </div>
              {pushPermission !== 'granted' && pushPermission !== 'denied' && (
                <button
                  type="button"
                  onClick={() => void handleEnablePush()}
                  className="px-2.5 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors whitespace-nowrap shrink-0"
                >
                  Enable Push
                </button>
              )}

              {geolocator.isWatching ? (
                <button
                  type="button"
                  onClick={geolocator.stopWatching}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Live GPS On</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={geolocator.startWatching}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Live Follow</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleUseGps}
                disabled={geolocator.status === 'acquiring'}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>{geolocator.status === 'acquiring' ? 'Fixing...' : 'GPS'}</span>
              </button>
            </div>
          </div>

          {(geolocator.isWatching || geolocator.fixCount > 0) && (
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
              <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
                <span className="text-slate-500 block font-sans">Accuracy</span>
                <span className="font-semibold text-slate-900">
                  {formatAccuracy(geolocator.accuracyMeters)}
                </span>
              </div>
              <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
                <span className="text-slate-500 block font-sans">Speed</span>
                <span className="font-semibold text-slate-900">
                  {formatSpeed(geolocator.speedMps)}
                </span>
              </div>
              <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
                <span className="text-slate-500 block font-sans">Heading</span>
                <span className="font-semibold text-slate-900 truncate block">
                  {formatHeading(geolocator.headingDeg)}
                </span>
              </div>
            </div>
          )}

          {geolocator.error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
              {geolocator.error}
            </p>
          )}

          <div className="grid lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-6">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Neighborhood or Street Pin
              </label>
              <PlaceSearchInput
                placeholder="Set neighborhood or street address..."
                onPlaceSelect={({ address, location }) => {
                  geolocator.stopWatching();
                  geolocator.setManualPosition(location, address);
                }}
              />
            </div>

            <div className="lg:col-span-6">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700">Search Radius</span>
                <span className="font-mono tabular-nums font-semibold text-orange-600">
                  {formatDistance(radiusMeters)}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 rounded-lg">
                {RADIUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.meters}
                    type="button"
                    onClick={() => setRadiusMeters(opt.meters)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      radiusMeters === opt.meters
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={400}
                max={16093}
                step={200}
                value={radiusMeters}
                onChange={(e) => setRadiusMeters(Number(e.target.value))}
                aria-label="Custom proximity radius in meters"
                className="w-full mt-2 accent-orange-600"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="grid md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-7 flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setFilterTab('nearby');
                    setSelectedCartId(null);
                  }}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                    filterTab === 'nearby'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Within Radius (
                  {enrichedCarts.filter((c) => c.distanceMeters <= radiusMeters).length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterTab('all');
                    setSelectedCartId(null);
                  }}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                    filterTab === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({carts.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterTab('favorites');
                    setSelectedCartId(null);
                  }}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap tabular-nums ${
                    filterTab === 'favorites'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Favorites ({favoriteIds.length})
                </button>
              </div>

              <div className="md:col-span-5 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <label
                  htmlFor="customer-nationality-filter"
                  className="text-xs font-medium text-slate-600 whitespace-nowrap shrink-0"
                >
                  Food Nationality
                </label>
                <select
                  id="customer-nationality-filter"
                  value={selectedNationality}
                  onChange={(e) => {
                    onSelectNationality(e.target.value);
                    setSelectedCartId(null);
                  }}
                  className="flex-1 min-w-0 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-md px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                >
                  <option value="All">All Nationalities</option>
                  {availableNationalities.map((nat) => (
                    <option key={nat} value={nat}>
                      {nat}
                    </option>
                  ))}
                </select>
                {selectedNationality !== 'All' && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectNationality('All');
                      setSelectedCartId(null);
                    }}
                    className="text-xs font-medium text-orange-600 hover:underline whitespace-nowrap shrink-0"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Filter by cart name search box */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  if (selectedCartId) setSelectedCartId(null);
                }}
                placeholder="Filter by cart name, nationality, cuisine, or spot..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>
        </section>

        {/* Live Google Map Viewport Directly Underneath Search Box */}
        <section aria-label="Live foodcart map" className="w-full h-[440px] sm:h-[500px] relative">
          <InteractiveDistrictMap
            center={
              selectedEntry
                ? { lat: selectedEntry.cart.currentLat, lng: selectedEntry.cart.currentLng }
                : customerLocation
            }
            zoom={selectedEntry ? 14 : 13}
            customerLocation={customerLocation}
            radiusMeters={radiusMeters}
            geolocatorAccuracyMeters={geolocator.accuracyMeters}
            geolocatorHeadingDeg={geolocator.headingDeg}
            geolocatorTrail={geolocator.trail}
            isGeolocatorStreaming={geolocator.isWatching}
            remoteTelemetryCenter={
              selectedCartTelemetry && selectedCartTelemetry.isStreaming
                ? { lat: selectedCartTelemetry.lat, lng: selectedCartTelemetry.lng }
                : null
            }
            remoteTelemetryAccuracyMeters={selectedCartTelemetry?.accuracyMeters ?? null}
            remoteTelemetryTrail={remoteTelemetryTrail}
            carts={visibleCarts.map((v) => v.cart)}
            selectedCartId={selectedCartId}
            favoriteIds={favoriteIds}
            routeStops={selectedEntry && showRouteOnMap ? routeStops : []}
            locationRequests={locationRequests.filter(
              (r) =>
                (r.status === 'pending' || r.status === 'approved') &&
                (!selectedCartId || r.cartId === selectedCartId)
            )}
            nowMs={nowMs}
            onSelectCart={(cart) => setSelectedCartId(cart.id)}
            onMapClick={(coords) => {
              geolocator.stopWatching();
              geolocator.setManualPosition(coords);
              void geolocator.reverseGeocode(coords).then((addr) => {
                if (selectedCartId) {
                  setReqCoords(coords);
                  if (addr) setReqLocationLabel(addr);
                }
              });
              if (selectedCartId) {
                setReqCoords(coords);
              }
            }}
          />
        </section>

        {/* Selected Cart Detail OR Matching Foodcart Directory Underneath Map */}
        {selectedEntry ? (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="relative h-52 sm:h-60 bg-slate-200">
              <img
                src={selectedEntry.cart.photoUrl}
                alt={selectedEntry.cart.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <button
                type="button"
                onClick={() => setSelectedCartId(null)}
                className="absolute top-3 left-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/95 text-slate-900 text-xs font-medium shadow-sm hover:bg-white whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Carts</span>
              </button>
              <button
                type="button"
                onClick={() => void handleToggleFavorite(selectedEntry.cart)}
                aria-label="Toggle favorite"
                className="absolute top-3 right-3 p-2 rounded-lg bg-white/95 text-slate-900 shadow-sm hover:bg-white"
              >
                <Heart
                  className={`w-4 h-4 ${
                    favoriteIds.includes(selectedEntry.cart.id)
                      ? 'fill-orange-600 text-orange-600'
                      : 'text-slate-700'
                  }`}
                />
              </button>
              <div className="absolute bottom-4 left-5 right-5 text-white">
                <h3 className="font-display font-bold text-2xl leading-tight">
                  {selectedEntry.cart.name}
                </h3>
                <p className="text-xs text-slate-200 mt-0.5 tabular-nums">
                  {getCartNationality(selectedEntry.cart)
                    ? `${getCartNationality(selectedEntry.cart)} · `
                    : ''}
                  {selectedEntry.cart.cuisine} · {formatDistance(selectedEntry.distanceMeters)} away
                </p>
              </div>
            </div>

            <div className="p-5 sm:p-6 grid lg:grid-cols-12 gap-6">
              {/* Left Column: Live Status, Route Schedule & Location Request */}
              <div className="lg:col-span-7 space-y-5">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="text-xs text-slate-600">
                    <div className="flex items-center gap-1.5 font-medium text-slate-900">
                      <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                      <span>{selectedEntry.cart.currentPlaceName || 'Pinned Location'}</span>
                    </div>
                    {selectedEntry.cart.broadcastMessage && (
                      <p className="mt-1 text-slate-500">{selectedEntry.cart.broadcastMessage}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-slate-500">
                      {selectedEntry.isActivelyLive ? 'Remaining' : 'Status'}
                    </div>
                    <div className="font-mono tabular-nums text-sm font-semibold text-orange-600">
                      {selectedEntry.isActivelyLive
                        ? selectedEntry.countdown.label
                        : 'Offline / Scheduled'}
                    </div>
                  </div>
                </div>

                {selectedCartTelemetry && selectedCartTelemetry.isStreaming && (
                  <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2 text-xs text-emerald-950">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Radio className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Cart Streaming Live GPS</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums">
                      {formatSpeed(selectedCartTelemetry.speedMps)} ·{' '}
                      {formatHeading(selectedCartTelemetry.headingDeg)} ·{' '}
                      {formatAccuracy(selectedCartTelemetry.accuracyMeters)}
                    </span>
                  </div>
                )}

                <p className="text-sm text-slate-700 leading-relaxed">
                  {selectedEntry.cart.description}
                </p>

                {/* Route Schedule Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                      <RouteIcon className="w-4 h-4 text-orange-600" />
                      <span>Route Schedule ({routeStops.length})</span>
                    </h4>
                    {routeStops.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowRouteOnMap((prev) => !prev)}
                        className="text-xs font-medium text-orange-600 hover:underline whitespace-nowrap"
                      >
                        {showRouteOnMap ? 'Hide Route on Map' : 'Show Route on Map'}
                      </button>
                    )}
                  </div>
                  {routeStops.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No recurring route stops published yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {routeStops.map((stop, idx) => (
                        <div
                          key={stop.id}
                          className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0 text-xs"
                        >
                          <div>
                            <div className="font-medium text-slate-900">
                              {String(idx + 1).padStart(2, '0')}. {stop.label}
                            </div>
                            <div className="text-slate-500">{stop.address}</div>
                          </div>
                          <div className="text-right font-mono tabular-nums text-[11px] text-slate-700 shrink-0">
                            <div>{stop.dayOfWeek}</div>
                            <div className="text-slate-500">
                              {stop.startTime}–{stop.endTime}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Request Foodcart at Location Section */}
                <div className="pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                      <LocateFixed className="w-4 h-4 text-orange-600" />
                      <span>Request Cart at Location</span>
                    </h4>
                    <span
                      className={`text-xs font-medium ${
                        selectedEntry.cart.requestsEnabled !== false
                          ? 'text-emerald-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {selectedEntry.cart.requestsEnabled !== false
                        ? 'Requests Open'
                        : 'Requests Turned Off'}
                    </span>
                  </div>

                  {selectedEntry.cart.requestsEnabled === false ? (
                    <p className="text-xs text-slate-500">
                      This foodcart owner currently has customer location requests turned off. Check
                      their scheduled stops above or browse another cart.
                    </p>
                  ) : (
                    <form onSubmit={handleSubmitLocationRequest} className="space-y-2.5">
                      <p className="text-xs text-slate-500">
                        Send your street address or current GPS pin to invite this foodcart.
                      </p>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-slate-700">
                            Requested Stop Location
                          </label>
                          <button
                            type="button"
                            onClick={handleUseRadarPinForRequest}
                            className="text-xs font-semibold text-orange-600 hover:underline whitespace-nowrap"
                          >
                            Use Radar Pin
                          </button>
                        </div>
                        <PlaceSearchInput
                          initialValue={reqLocationLabel}
                          placeholder="Search street, workplace, or plaza..."
                          onPlaceSelect={({ address, location }) => {
                            setReqLocationLabel(address);
                            setReqCoords(location);
                          }}
                        />
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                          <span className="truncate font-sans max-w-[260px]">
                            Pin: {reqLocationLabel || 'Custom map coordinates'}
                          </span>
                          <span>
                            {reqCoords.lat.toFixed(4)}, {reqCoords.lng.toFixed(4)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-7">
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Preferred Window
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={60}
                            value={reqTime}
                            onChange={(e) => setReqTime(e.target.value)}
                            placeholder="e.g., Today 12:15 PM"
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                          />
                        </div>
                        <div className="col-span-5">
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Est. Guests
                          </label>
                          <input
                            type="number"
                            required
                            min={1}
                            max={500}
                            value={reqPartySize}
                            onChange={(e) =>
                              setReqPartySize(
                                Math.min(500, Math.max(1, Number(e.target.value) || 1))
                              )
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                          />
                        </div>
                      </div>

                      <input
                        type="text"
                        maxLength={240}
                        value={reqNote}
                        onChange={(e) => setReqNote(e.target.value)}
                        placeholder="Optional note (parking access, event details, curb clearance)"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      />

                      <button
                        type="submit"
                        disabled={submittingRequest}
                        className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap"
                      >
                        {user
                          ? submittingRequest
                            ? 'Sending Location Request...'
                            : 'Request Foodcart Stop'
                          : 'Sign In with Google to Request Stop'}
                      </button>

                      {requestFeedback && (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{requestFeedback}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveDrawer('requests')}
                            className="font-semibold text-emerald-800 hover:underline whitespace-nowrap shrink-0"
                          >
                            My Requests
                          </button>
                        </div>
                      )}
                    </form>
                  )}

                  {selectedCartRequests.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
                      <div className="text-[11px] font-medium text-slate-500">
                        Your Recent Requests for {selectedEntry.cart.name}
                      </div>
                      {selectedCartRequests.slice(0, 2).map((r) => (
                        <div
                          key={r.id}
                          className="text-xs py-1.5 border-b border-slate-100 last:border-b-0 space-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-900 truncate">
                              {r.locationLabel}
                            </span>
                            <span
                              className={`font-mono text-[11px] font-semibold capitalize shrink-0 ${
                                r.status === 'approved'
                                  ? 'text-emerald-700'
                                  : r.status === 'denied'
                                    ? 'text-red-700'
                                    : r.status === 'pending'
                                      ? 'text-amber-700'
                                      : 'text-slate-500'
                              }`}
                            >
                              {r.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {r.requestedTime} · {r.partySize} guests
                          </div>
                          {r.ownerNote && (
                            <p className="text-[11px] text-slate-700">Owner reply: {r.ownerNote}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Pre-Order Menu */}
              <div className="lg:col-span-5 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-display font-semibold text-sm text-slate-900">
                    Pre-Order Menu
                  </h4>
                  <span className="text-xs text-slate-500">
                    {selectedEntry.cart.preOrderEnabled ? 'Pickup Open' : 'Pre-orders Paused'}
                  </span>
                </div>

                {!selectedEntry.cart.preOrderEnabled ? (
                  <p className="text-xs text-slate-500">
                    This cart is currently serving walk-up orders only.
                  </p>
                ) : menuItems.length === 0 ? (
                  <p className="text-xs text-slate-500">No menu items published yet.</p>
                ) : (
                  <form onSubmit={handleSubmitPreOrder} className="space-y-3">
                    <div className="divide-y divide-slate-100">
                      {menuItems.map((item) => {
                        const qty = bag[item.id] || 0;
                        return (
                          <div
                            key={item.id}
                            className="py-2.5 flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-900">{item.name}</div>
                              {item.description && (
                                <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                              )}
                              <div className="mt-1 text-xs font-mono tabular-nums text-slate-700">
                                {formatCurrency(item.priceCents)} · {item.prepMinutes}m prep
                              </div>
                            </div>
                            {item.available ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBag((prev) => ({
                                      ...prev,
                                      [item.id]: Math.max(0, (prev[item.id] || 0) - 1),
                                    }))
                                  }
                                  aria-label={`Remove ${item.name}`}
                                  className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-5 text-center font-mono tabular-nums text-xs font-semibold">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBag((prev) => ({
                                      ...prev,
                                      [item.id]: (prev[item.id] || 0) + 1,
                                    }))
                                  }
                                  aria-label={`Add ${item.name}`}
                                  className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-slate-900 text-white hover:bg-slate-800"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Sold out</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {bagCount > 0 && (
                      <div className="pt-3 border-t border-slate-200 space-y-2.5">
                        <input
                          type="text"
                          maxLength={200}
                          value={pickupNote}
                          onChange={(e) => setPickupNote(e.target.value)}
                          placeholder="Pickup note (e.g., Extra lime, arriving in 10m)"
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        />
                        <button
                          type="submit"
                          disabled={submittingOrder}
                          className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-60 transition-colors flex items-center justify-between"
                        >
                          <span>
                            {user
                              ? submittingOrder
                                ? 'Sending Pre-Order...'
                                : `Place Pre-Order (${bagCount})`
                              : 'Sign In with Google to Pre-Order'}
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatCurrency(bagTotalCents)}
                          </span>
                        </button>
                      </div>
                    )}

                    {orderFeedback && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{orderFeedback}</span>
                      </div>
                    )}
                  </form>
                )}
              </div>
            </div>
          </section>
        ) : visibleCarts.length === 0 ? (
          <section className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
            <Store className="w-8 h-8 text-slate-400 mx-auto" />
            <div>
              <p className="font-display font-semibold text-sm text-slate-900">
                {carts.length === 0
                  ? 'No foodcarts are registered yet'
                  : filterTab === 'favorites'
                    ? 'No favorite foodcarts saved yet'
                    : selectedNationality !== 'All'
                      ? `No ${selectedNationality} foodcarts match current filters`
                      : 'No foodcarts found within this radius'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {carts.length === 0
                  ? 'Register a foodcart as an Owner or deploy 4 sample district carts around your map pin.'
                  : 'Try expanding your radius, resetting Food Nationality, or switching to All Carts.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {carts.length === 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSeedFleet()}
                    disabled={seeding}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-60 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {seeding
                        ? 'Deploying...'
                        : user
                          ? 'Load 4 Sample District Carts'
                          : 'Sign In to Load Sample Carts'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={onSwitchToOwner}
                    className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 whitespace-nowrap"
                  >
                    Switch to Owner Mode
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFilterTab('all');
                    onSelectNationality('All');
                    setSearchText('');
                  }}
                  className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                >
                  Reset Filters &amp; Show All Carts
                </button>
              )}
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleCarts.map(({ cart, distanceMeters, countdown, isActivelyLive }) => {
              const isFav = favoriteIds.includes(cart.id);
              return (
                <div
                  key={cart.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors"
                >
                  <div className="grid grid-cols-12 h-full">
                    <button
                      type="button"
                      onClick={() => setSelectedCartId(cart.id)}
                      className="col-span-4 bg-slate-100 relative overflow-hidden text-left"
                    >
                      <img
                        src={cart.photoUrl}
                        alt={cart.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full min-h-[120px] object-cover"
                      />
                    </button>
                    <div className="col-span-8 p-3.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCartId(cart.id)}
                            className="text-left min-w-0"
                          >
                            <h3 className="font-display font-semibold text-sm text-slate-900 truncate">
                              {cart.name}
                            </h3>
                            <p className="text-xs text-slate-500 truncate tabular-nums">
                              {getCartNationality(cart) ? `${getCartNationality(cart)} · ` : ''}
                              {cart.cuisine} · {formatDistance(distanceMeters)}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleFavorite(cart)}
                            aria-label={`Favorite ${cart.name}`}
                            className="p-1.5 rounded-md hover:bg-slate-100 shrink-0"
                          >
                            <Heart
                              className={`w-4 h-4 ${
                                isFav ? 'fill-orange-600 text-orange-600' : 'text-slate-400'
                              }`}
                            />
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600 truncate">
                          {cart.currentPlaceName || 'Pinned District Stop'}
                          {' · '}
                          <span className="text-slate-500">
                            {cart.requestsEnabled !== false ? 'Requests open' : 'Requests off'}
                          </span>
                        </p>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                        <span
                          className={`font-mono tabular-nums font-medium flex items-center gap-1 ${
                            isActivelyLive ? 'text-orange-600' : 'text-slate-500'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>{isActivelyLive ? countdown.label : 'Offline'}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedCartId(cart.id)}
                          className="font-semibold text-slate-900 hover:text-orange-600 whitespace-nowrap"
                        >
                          {cart.preOrderEnabled ? 'Menu & Route →' : 'View Details →'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>

      {/* Slide-over Alerts, Location Requests, or Orders Drawer */}
      {activeDrawer !== 'none' && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setActiveDrawer('none')}
            className="fixed inset-0 bg-slate-900/20 z-40"
          />
          <aside className="fixed top-0 right-0 bottom-0 w-[360px] max-w-[92vw] bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-slate-900">
                {activeDrawer === 'alerts'
                  ? 'Nearby Push Alerts'
                  : activeDrawer === 'requests'
                    ? 'My Location Requests'
                    : 'My Pre-Orders'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveDrawer('none')}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeDrawer === 'alerts' ? (
                nearbyAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No proximity alerts inside your current radius yet. Favorite a cart or widen
                    your radius to catch live dispatches.
                  </p>
                ) : (
                  nearbyAlerts.map((a) => {
                    const dist = getDistanceMeters(customerLocation, { lat: a.lat, lng: a.lng });
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setSelectedCartId(a.cartId);
                          setActiveDrawer('none');
                        }}
                        className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-orange-400 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display font-semibold text-xs text-slate-900">
                            {a.cartName}
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-orange-600">
                            {formatDistance(dist)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{a.message}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {a.placeName}
                          {a.timerMinutes > 0 && ` · ${a.timerMinutes}m stop`}
                        </p>
                      </button>
                    );
                  })
                )
              ) : activeDrawer === 'requests' ? (
                !user ? (
                  <div className="text-center py-6 space-y-3">
                    <p className="text-xs text-slate-600">
                      Sign in with Google to submit and track foodcart location requests.
                    </p>
                    <button
                      type="button"
                      onClick={() => void onSignIn()}
                      className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
                    >
                      Sign In with Google
                    </button>
                  </div>
                ) : locationRequests.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    You have not requested any foodcart stops yet. Open a cart with Requests Open to
                    invite them to your GPS pin or street address.
                  </p>
                ) : (
                  locationRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-lg border border-slate-200 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCartId(req.cartId);
                            setActiveDrawer('none');
                          }}
                          className="font-display font-semibold text-xs text-slate-900 hover:text-orange-600 text-left truncate"
                        >
                          {req.cartName}
                        </button>
                        <span
                          className={`font-mono text-[11px] font-semibold capitalize shrink-0 ${
                            req.status === 'approved'
                              ? 'text-emerald-700'
                              : req.status === 'denied'
                                ? 'text-red-700'
                                : req.status === 'pending'
                                  ? 'text-amber-700'
                                  : 'text-slate-500'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-800">{req.locationLabel}</p>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {req.requestedTime} · {req.partySize} guests
                      </p>
                      {req.note && <p className="text-xs text-slate-600">Note: {req.note}</p>}
                      {req.ownerNote && (
                        <p className="text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
                          <span className="font-semibold">Owner:</span> {req.ownerNote}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCartId(req.cartId);
                            setActiveDrawer('none');
                          }}
                          className="text-slate-700 font-medium hover:text-orange-600"
                        >
                          View Cart
                        </button>
                        {req.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => void cancelCartLocationRequest(req.id)}
                            className="text-red-600 font-medium hover:underline"
                          >
                            Cancel Request
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : !user ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-xs text-slate-600">
                    Sign in with Google to view your pre-order pickup history.
                  </p>
                  <button
                    type="button"
                    onClick={() => void onSignIn()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
                  >
                    Sign In with Google
                  </button>
                </div>
              ) : orders.length === 0 ? (
                <p className="text-xs text-slate-500">
                  You have not placed any pre-orders yet. Select a foodcart to order ahead.
                </p>
              ) : (
                orders.map((ord) => (
                  <div key={ord.id} className="p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold text-xs text-slate-900">
                        {ord.cartName}
                      </span>
                      <span className="font-mono text-[11px] font-semibold uppercase text-orange-600">
                        {ord.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700">{ord.itemsSummary}</p>
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="font-mono tabular-nums text-slate-500">
                        {formatCurrency(ord.totalCents)}
                      </span>
                      {ord.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => void updateOrderStatus(ord.id, 'cancelled')}
                          className="text-red-600 font-medium hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
};
