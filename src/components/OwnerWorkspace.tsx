import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowLeft,
  BellRing,
  Check,
  Clock,
  ImagePlus,
  LocateFixed,
  Plus,
  Radio,
  Route as RouteIcon,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useRealtimeGeolocator } from '../hooks/useRealtimeGeolocator';
import {
  addMenuItem,
  addRouteStop,
  createFoodcart,
  deleteMenuItem,
  deleteRouteStop,
  publishCartTelemetry,
  respondToCartLocationRequest,
  seedDistrictFleet,
  subscribeMenuItems,
  subscribeOwnerFoodcarts,
  subscribeOwnerLocationRequests,
  subscribeOwnerOrders,
  subscribeRouteStops,
  toggleFoodcartRequestsEnabled,
  toggleMenuItemAvailability,
  updateFoodcartLiveLocationAndNotify,
  updateFoodcartProfile,
  updateOrderStatus,
} from '../services/foodcartService';
import {
  CartLocationRequest,
  Foodcart,
  LatLngLiteral,
  MenuItem,
  OrderStatus,
  PreOrder,
  RouteStop,
} from '../types';
import {
  compressImageToDataUrl,
  DEFAULT_CENTER,
  FOOD_NATIONALITIES,
  formatCountdown,
  formatCurrency,
  formatDistance,
  getCartNationality,
  getDistanceMeters,
  PRESET_CART_PHOTOS,
} from '../utils/geo';
import { InteractiveDistrictMap, PlaceSearchInput } from './MapComponents';
import { RealtimeGeolocatorPanel } from './RealtimeGeolocatorPanel';

interface OwnerWorkspaceProps {
  user: User | null;
  onReturnToRoleSelect: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

type OwnerTab = 'dispatch' | 'profile' | 'route' | 'requests' | 'orders';

export const OwnerWorkspace: React.FC<OwnerWorkspaceProps> = ({
  user,
  onReturnToRoleSelect,
  onSignIn,
  onSignOut,
}) => {
  const [carts, setCarts] = useState<Foodcart[]>([]);
  const [activeCartId, setActiveCartId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OwnerTab>('dispatch');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [orders, setOrders] = useState<PreOrder[]>([]);
  const [locationRequests, setLocationRequests] = useState<CartLocationRequest[]>([]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Create cart form state
  const [newName, setNewName] = useState('');
  const [newNationality, setNewNationality] = useState<string>('');
  const [newCuisine, setNewCuisine] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState(PRESET_CART_PHOTOS[0].url);
  const [newPreOrder, setNewPreOrder] = useState(true);
  const [newRequestsEnabled, setNewRequestsEnabled] = useState(true);
  const [newPlaceName, setNewPlaceName] = useState('Central Industrial Yard');
  const [newCoords, setNewCoords] = useState<LatLngLiteral>(DEFAULT_CENTER);
  const [creatingCart, setCreatingCart] = useState(false);

  // Live dispatch state
  const [pinCoords, setPinCoords] = useState<LatLngLiteral>(DEFAULT_CENTER);
  const [pinPlaceName, setPinPlaceName] = useState('');
  const [timerMinutes, setTimerMinutes] = useState<number>(90);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendPushAlert, setSendPushAlert] = useState(true);
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [autoFollowMap, setAutoFollowMap] = useState(true);
  const [lastFirestoreSyncMs, setLastFirestoreSyncMs] = useState<number | null>(null);
  const lastSyncedRef = useRef<{ coords: LatLngLiteral; timestampMs: number } | null>(null);
  const pingCounterRef = useRef<number>(0);

  // Edit profile state
  const [editName, setEditName] = useState('');
  const [editNationality, setEditNationality] = useState<string>('');
  const [editCuisine, setEditCuisine] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState(PRESET_CART_PHOTOS[0].url);
  const [editGalleryUrls, setEditGalleryUrls] = useState<string[]>([PRESET_CART_PHOTOS[0].url]);
  const [editListed, setEditListed] = useState(true);
  const [editPreOrder, setEditPreOrder] = useState(true);
  const [editRequestsEnabled, setEditRequestsEnabled] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Customer Location Requests management state
  const [togglingRequests, setTogglingRequests] = useState(false);
  const [requestFilter, setRequestFilter] = useState<'pending' | 'all'>('pending');
  const [ownerNotesById, setOwnerNotesById] = useState<Record<string, string>>({});
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [focusedRequestCoords, setFocusedRequestCoords] = useState<LatLngLiteral | null>(null);

  // Route stop form
  const [stopLabel, setStopLabel] = useState('');
  const [stopAddress, setStopAddress] = useState('');
  const [stopCoords, setStopCoords] = useState<LatLngLiteral>(DEFAULT_CENTER);
  const [stopDay, setStopDay] = useState('Mon–Fri');
  const [stopStart, setStopStart] = useState('11:00');
  const [stopEnd, setStopEnd] = useState('14:30');
  const [addingStop, setAddingStop] = useState(false);

  // Menu item form
  const [itemName, setItemName] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPriceDollars, setItemPriceDollars] = useState('12.50');
  const [itemPrepMin, setItemPrepMin] = useState('8');
  const [addingItem, setAddingItem] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) {
      setCarts([]);
      setOrders([]);
      setLocationRequests([]);
      return;
    }
    const unsubCarts = subscribeOwnerFoodcarts(user.uid, (list) => {
      setCarts(list);
      if (list.length > 0 && (!activeCartId || !list.some((c) => c.id === activeCartId))) {
        setActiveCartId(list[0].id);
      }
    });
    const unsubOrders = subscribeOwnerOrders(user.uid, setOrders);
    const unsubRequests = subscribeOwnerLocationRequests(user.uid, setLocationRequests);
    return () => {
      unsubCarts();
      unsubOrders();
      unsubRequests();
    };
  }, [user, activeCartId]);

  const activeCart = useMemo(
    () => carts.find((c) => c.id === activeCartId) || null,
    [carts, activeCartId]
  );

  // Sync active cart into form buffers
  useEffect(() => {
    if (!activeCart) return;
    setPinCoords({ lat: activeCart.currentLat, lng: activeCart.currentLng });
    setPinPlaceName(activeCart.currentPlaceName);
    setTimerMinutes(activeCart.timerMinutes || 90);
    setBroadcastMessage(activeCart.broadcastMessage || '');

    setEditName(activeCart.name);
    setEditNationality(getCartNationality(activeCart));
    setEditCuisine(activeCart.cuisine);
    setEditDesc(activeCart.description);
    setEditPhotoUrl(activeCart.photoUrl);
    setEditGalleryUrls(
      activeCart.galleryUrls?.length ? activeCart.galleryUrls : [activeCart.photoUrl]
    );
    setEditListed(activeCart.isListed);
    setEditPreOrder(activeCart.preOrderEnabled);
    setEditRequestsEnabled(activeCart.requestsEnabled !== false);
    setFocusedRequestCoords(null);

    setStopCoords({ lat: activeCart.currentLat, lng: activeCart.currentLng });
  }, [activeCart]);

  useEffect(() => {
    if (!activeCartId) {
      setMenuItems([]);
      setRouteStops([]);
      return;
    }
    const unsubMenu = subscribeMenuItems(activeCartId, setMenuItems);
    const unsubStops = subscribeRouteStops(activeCartId, setRouteStops);
    return () => {
      unsubMenu();
      unsubStops();
    };
  }, [activeCartId]);

  const activeCartRef = useRef<Foodcart | null>(null);
  activeCartRef.current = activeCart;
  const pinPlaceNameRef = useRef<string>('');
  pinPlaceNameRef.current = pinPlaceName;

  const geolocator = useRealtimeGeolocator({
    autoReverseGeocode: true,
    maxTrailPoints: 60,
    onFix: (fix) => {
      setPinCoords(fix.coords);
      const cart = activeCartRef.current;
      if (!cart || !cart.isLive) return;

      const now = Date.now();
      const prev = lastSyncedRef.current;
      const movedMeters = prev ? getDistanceMeters(prev.coords, fix.coords) : Infinity;
      const elapsedMs = prev ? now - prev.timestampMs : Infinity;

      if (movedMeters >= 8 || elapsedMs >= 4000) {
        lastSyncedRef.current = { coords: fix.coords, timestampMs: now };
        pingCounterRef.current += 1;
        void publishCartTelemetry(cart, {
          isStreaming: true,
          lat: fix.coords.lat,
          lng: fix.coords.lng,
          accuracyMeters: fix.accuracyMeters,
          headingDeg: fix.headingDeg,
          speedMps: fix.speedMps,
          placeLabel: pinPlaceNameRef.current || cart.currentPlaceName || 'Live GPS Stream',
          pingCount: pingCounterRef.current,
          syncCartLocation: true,
        }).then(() => {
          setLastFirestoreSyncMs(Date.now());
        });
      }
    },
  });

  // Notify Firestore when owner turns off live GPS streaming
  const prevWatchingRef = useRef(false);
  useEffect(() => {
    const wasWatching = prevWatchingRef.current;
    prevWatchingRef.current = geolocator.isWatching;
    if (wasWatching && !geolocator.isWatching && activeCart && activeCart.isLive) {
      void publishCartTelemetry(activeCart, {
        isStreaming: false,
        lat: pinCoords.lat,
        lng: pinCoords.lng,
        accuracyMeters: geolocator.accuracyMeters || 0,
        headingDeg: geolocator.headingDeg,
        speedMps: 0,
        placeLabel: pinPlaceName || activeCart.currentPlaceName || 'Pinned Stop',
        pingCount: pingCounterRef.current,
        syncCartLocation: false,
      });
    }
  }, [
    geolocator.isWatching,
    geolocator.accuracyMeters,
    geolocator.headingDeg,
    activeCart,
    pinCoords,
    pinPlaceName,
  ]);

  const handleCreateCart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newName.trim() || !newCuisine.trim() || !newDesc.trim()) return;
    setCreatingCart(true);
    setErrorMsg(null);
    try {
      const id = await createFoodcart(user.uid, {
        name: newName,
        foodNationality: newNationality,
        cuisine: newCuisine,
        description: newDesc,
        photoUrl: newPhotoUrl,
        galleryUrls: [newPhotoUrl],
        preOrderEnabled: newPreOrder,
        requestsEnabled: newRequestsEnabled,
        currentLat: newCoords.lat,
        currentLng: newCoords.lng,
        currentPlaceName: newPlaceName,
      });
      setActiveCartId(id);
      setShowCreateModal(false);
      setNewName('');
      setNewNationality('');
      setNewCuisine('');
      setNewDesc('');
      setStatusBanner('Foodcart profile created. Set your live stop timer to go online.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create foodcart.');
    } finally {
      setCreatingCart(false);
    }
  };

  const handleSeedFleet = async () => {
    if (!user) return;
    setSeeding(true);
    setErrorMsg(null);
    try {
      await seedDistrictFleet(user.uid, DEFAULT_CENTER);
      setStatusBanner('4 sample district foodcarts deployed to your fleet.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to deploy sample fleet.');
    } finally {
      setSeeding(false);
    }
  };

  const handleGoLive = async (goLive: boolean) => {
    if (!activeCart) return;
    setSavingDispatch(true);
    setErrorMsg(null);
    try {
      await updateFoodcartLiveLocationAndNotify(activeCart, {
        isLive: goLive,
        currentLat: pinCoords.lat,
        currentLng: pinCoords.lng,
        currentPlaceName: pinPlaceName || 'Pinned Stop',
        timerMinutes: goLive ? timerMinutes : 0,
        broadcastMessage,
        sendPushAlert: goLive && sendPushAlert,
      });
      setStatusBanner(
        goLive
          ? sendPushAlert
            ? `Live stop active for ${timerMinutes} min — proximity push notification dispatched.`
            : `Live stop updated for ${timerMinutes} min.`
          : 'Cart stop ended and set offline.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update live location.');
    } finally {
      setSavingDispatch(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCart) return;
    setSavingProfile(true);
    setErrorMsg(null);
    try {
      await updateFoodcartProfile(activeCart.id, {
        name: editName,
        foodNationality: editNationality,
        cuisine: editCuisine,
        description: editDesc,
        photoUrl: editPhotoUrl,
        galleryUrls: editGalleryUrls,
        isListed: editListed,
        preOrderEnabled: editPreOrder,
        requestsEnabled: editRequestsEnabled,
      });
      setStatusBanner('Foodcart profile and photo gallery saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleRequestsEnabled = async () => {
    if (!activeCart) return;
    const nextValue = !(activeCart.requestsEnabled !== false);
    setTogglingRequests(true);
    setErrorMsg(null);
    try {
      await toggleFoodcartRequestsEnabled(activeCart.id, nextValue);
      setEditRequestsEnabled(nextValue);
      setStatusBanner(
        nextValue
          ? `Customer location requests turned ON for ${activeCart.name}.`
          : `Customer location requests turned OFF for ${activeCart.name}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to toggle location requests.');
    } finally {
      setTogglingRequests(false);
    }
  };

  const handleRespondToRequest = async (
    req: CartLocationRequest,
    decision: 'approved' | 'denied'
  ) => {
    setRespondingRequestId(req.id);
    setErrorMsg(null);
    try {
      await respondToCartLocationRequest(req.id, decision, ownerNotesById[req.id] || '');
      setStatusBanner(
        decision === 'approved'
          ? `Approved location request at ${req.locationLabel}.`
          : `Denied location request at ${req.locationLabel}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update location request.');
    } finally {
      setRespondingRequestId(null);
    }
  };

  const handleDispatchToRequest = (req: CartLocationRequest) => {
    const clean = {
      lat: Number(req.lat.toFixed(6)),
      lng: Number(req.lng.toFixed(6)),
    };
    geolocator.stopWatching();
    geolocator.setManualPosition(clean, req.locationLabel);
    setPinCoords(clean);
    setPinPlaceName(req.locationLabel);
    setBroadcastMessage(
      `Serving requested stop at ${req.locationLabel} (${req.requestedTime})!`
    );
    setActiveTab('dispatch');
    setStatusBanner(
      `Loaded ${req.locationLabel} into Real-Time Geo Dispatch. Click Go Live to notify nearby customers.`
    );
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setEditPhotoUrl(compressed);
      setEditGalleryUrls((prev) => [compressed, ...prev.filter((u) => u !== compressed)].slice(0, 5));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Image upload failed.');
    }
  };

  const handleAddStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCart || !user || !stopLabel.trim() || !stopAddress.trim()) return;
    setAddingStop(true);
    setErrorMsg(null);
    try {
      await addRouteStop(activeCart.id, user.uid, {
        orderIndex: routeStops.length,
        label: stopLabel,
        address: stopAddress,
        lat: stopCoords.lat,
        lng: stopCoords.lng,
        dayOfWeek: stopDay,
        startTime: stopStart,
        endTime: stopEnd,
      });
      setStopLabel('');
      setStopAddress('');
      setStatusBanner('Route stop added to schedule.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add route stop.');
    } finally {
      setAddingStop(false);
    }
  };

  const handleAddMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCart || !user || !itemName.trim()) return;
    const priceCents = Math.round(Number.parseFloat(itemPriceDollars || '0') * 100);
    const prepMinutes = Number.parseInt(itemPrepMin || '5', 10);
    if (Number.isNaN(priceCents) || priceCents < 50) {
      setErrorMsg('Enter a valid item price ($0.50 minimum).');
      return;
    }
    setAddingItem(true);
    setErrorMsg(null);
    try {
      await addMenuItem(activeCart.id, user.uid, {
        name: itemName,
        description: itemDesc,
        priceCents,
        prepMinutes: Number.isNaN(prepMinutes) ? 5 : prepMinutes,
      });
      setItemName('');
      setItemDesc('');
      setStatusBanner('Pre-order menu item added.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add menu item.');
    } finally {
      setAddingItem(false);
    }
  };

  const activeCountdown = activeCart
    ? formatCountdown(activeCart.timerExpiresAtMs, nowMs)
    : { label: 'Offline', isExpired: false, isUrgent: false };

  const activeCartOrders = useMemo(
    () => (activeCart ? orders.filter((o) => o.cartId === activeCart.id) : orders),
    [orders, activeCart]
  );

  const activeCartRequests = useMemo(
    () => (activeCart ? locationRequests.filter((r) => r.cartId === activeCart.id) : locationRequests),
    [locationRequests, activeCart]
  );

  const pendingCartRequestsCount = useMemo(
    () => activeCartRequests.filter((r) => r.status === 'pending').length,
    [activeCartRequests]
  );

  const filteredCartRequests = useMemo(() => {
    if (requestFilter === 'pending') {
      return activeCartRequests.filter((r) => r.status === 'pending');
    }
    return activeCartRequests;
  }, [activeCartRequests, requestFilter]);

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
              Industrial Foodcarts · Owner Console
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user && carts.length > 0 && (
              <>
                <select
                  value={activeCartId || ''}
                  onChange={(e) => setActiveCartId(e.target.value)}
                  aria-label="Select active foodcart"
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-900 max-w-[180px]"
                >
                  {carts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New Cart</span>
                </button>
              </>
            )}

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
                Sign In with Google
              </button>
            )}
          </div>
        </div>
      </header>

      {statusBanner && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs text-emerald-900 flex items-center justify-between">
          <span>{statusBanner}</span>
          <button type="button" onClick={() => setStatusBanner(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-xs text-red-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Unauthenticated Gate */}
      {!user ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto">
              <Truck className="w-6 h-6" />
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Sign in to manage your foodcart
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Authenticate with Google to create your cart profile, upload photos, broadcast your
              live GPS stop with a timer, schedule routes, and receive pre-orders.
            </p>
            <button
              type="button"
              onClick={() => void onSignIn()}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Continue with Google
            </button>
          </div>
        </div>
      ) : carts.length === 0 || showCreateModal ? (
        /* Empty Fleet Onboarding or New Cart Form */
        <div className="flex-1 max-w-3xl w-full mx-auto p-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">
                  Register a Foodcart Profile
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Set up your mobile kitchen’s details, cover photograph, and starting yard pin.
                </p>
              </div>
              {carts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              )}
            </div>

            {carts.length === 0 && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">Quick Start:</span> Deploy 4
                  pre-built industrial foodcarts with menus, routes, and live timers to test right
                  away.
                </div>
                <button
                  type="button"
                  onClick={() => void handleSeedFleet()}
                  disabled={seeding}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{seeding ? 'Deploying...' : 'Load 4 Sample Carts'}</span>
                </button>
              </div>
            )}

            <form onSubmit={handleCreateCart} className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Foodcart Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Foundry Street Tacos"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Food Nationality (Optional)
                  </label>
                  <select
                    value={newNationality}
                    onChange={(e) => setNewNationality(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  >
                    <option value="">None / Not Selected</option>
                    {FOOD_NATIONALITIES.map((nat) => (
                      <option key={nat} value={nat}>
                        {nat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cuisine / Specialty
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={40}
                    value={newCuisine}
                    onChange={(e) => setNewCuisine(e.target.value)}
                    placeholder="e.g., Wood-Fired Tacos"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={600}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Describe your kitchen setup, signature plates, and dietary options..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Cover Photograph
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {PRESET_CART_PHOTOS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setNewPhotoUrl(preset.url)}
                      className={`rounded-lg overflow-hidden border-2 aspect-[4/3] ${
                        newPhotoUrl === preset.url ? 'border-orange-600' : 'border-transparent'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={preset.label}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Starting Yard / Address
                </label>
                <PlaceSearchInput
                  initialValue={newPlaceName}
                  onPlaceSelect={({ address, location }) => {
                    setNewPlaceName(address);
                    setNewCoords(location);
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={newPreOrder}
                    onChange={(e) => setNewPreOrder(e.target.checked)}
                    className="rounded border-slate-300 accent-orange-600"
                  />
                  <span>Enable customer pre-ordering from menu</span>
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={newRequestsEnabled}
                    onChange={(e) => setNewRequestsEnabled(e.target.checked)}
                    className="rounded border-slate-300 accent-orange-600"
                  />
                  <span>Accept customer location requests</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={creatingCart}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
              >
                {creatingCart ? 'Creating Foodcart...' : 'Create Foodcart Profile'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        activeCart && (
          <div className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 space-y-4">
            {/* Workspace Tab Strip */}
            <div className="bg-white border border-slate-200 rounded-xl p-2 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTab('dispatch')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'dispatch'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Live Location &amp; Timer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'profile'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Profile &amp; Photos</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('route')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'route'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <RouteIcon className="w-3.5 h-3.5" />
                  <span>Route Schedule ({routeStops.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('requests')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'requests'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  <span>
                    Location Requests (
                    {pendingCartRequestsCount > 0
                      ? `${pendingCartRequestsCount} pending`
                      : activeCartRequests.length}
                    )
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'orders'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Pre-Order Menu &amp; Queue ({activeCartOrders.length})</span>
                </button>
              </div>

              <div className="px-3 text-xs flex flex-wrap items-center gap-3">
                <span className="text-slate-500 whitespace-nowrap">
                  Nationality:{' '}
                  <strong className="text-slate-900">
                    {getCartNationality(activeCart) || 'None'}
                  </strong>
                </span>
                <button
                  type="button"
                  disabled={togglingRequests}
                  onClick={() => void handleToggleRequestsEnabled()}
                  className={`px-2.5 py-1.5 rounded-lg border font-medium transition-colors whitespace-nowrap ${
                    activeCart.requestsEnabled !== false
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  Requests: {activeCart.requestsEnabled !== false ? 'On' : 'Off'}
                </button>
                <span className="text-slate-500 whitespace-nowrap">
                  Status:{' '}
                  <strong
                    className={
                      activeCart.isLive && !activeCountdown.isExpired
                        ? 'text-emerald-700'
                        : 'text-slate-700'
                    }
                  >
                    {activeCart.isLive && !activeCountdown.isExpired ? 'Live on Map' : 'Offline'}
                  </strong>
                </span>
                {activeCart.isLive && !activeCountdown.isExpired && (
                  <span className="font-mono tabular-nums font-semibold text-orange-600 whitespace-nowrap">
                    {activeCountdown.label}
                  </span>
                )}
              </div>
            </div>

            {/* TAB 1: Live Location, Timer & Push Broadcast */}
            {activeTab === 'dispatch' && (
              <div className="grid lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-lg text-slate-900">
                      Real-Time Geo Dispatch
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Set your exact stop on the map, configure the stop countdown timer, and notify
                      nearby customers.
                    </p>
                  </div>

                  <RealtimeGeolocatorPanel
                    geolocator={geolocator}
                    compact
                    title="Live GPS Geolocator"
                    subtitle="Stream real-time GPS coordinates to customers"
                    firestoreSyncActive={geolocator.isWatching && activeCart.isLive}
                    lastFirestoreSyncMs={lastFirestoreSyncMs}
                    autoCenter={autoFollowMap}
                    onToggleAutoCenter={setAutoFollowMap}
                  />

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-700">
                      Address Search or Display Stop Name
                    </label>
                    <PlaceSearchInput
                      initialValue={pinPlaceName}
                      placeholder="Search address or cross street..."
                      onPlaceSelect={({ address, location }) => {
                        geolocator.stopWatching();
                        geolocator.setManualPosition(location, address);
                        setPinPlaceName(address);
                        setPinCoords(location);
                      }}
                    />
                    <input
                      type="text"
                      maxLength={160}
                      value={pinPlaceName}
                      onChange={(e) => setPinPlaceName(e.target.value)}
                      placeholder="Display stop name (e.g., North Foundry Yard)"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-700">Stop Timer Duration</span>
                      <span className="font-mono font-semibold text-orange-600">
                        {timerMinutes} min
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[30, 60, 120, 240].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setTimerMinutes(mins)}
                          className={`py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            timerMinutes === mins
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {mins >= 60 ? `${mins / 60} hr` : `${mins} min`}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={5}
                      max={720}
                      value={timerMinutes}
                      onChange={(e) => setTimerMinutes(Number(e.target.value) || 30)}
                      className="mt-2 w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Push Notification Message
                    </label>
                    <input
                      type="text"
                      maxLength={200}
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="e.g., Fresh brisket tacos & cold brew ready until 2 PM!"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={sendPushAlert}
                        onChange={(e) => setSendPushAlert(e.target.checked)}
                        className="accent-orange-600"
                      />
                      <span>Send push notification to nearby &amp; favorited customers</span>
                    </label>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      disabled={savingDispatch}
                      onClick={() => void handleGoLive(true)}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-60"
                    >
                      <BellRing className="w-4 h-4" />
                      <span>
                        {savingDispatch
                          ? 'Broadcasting...'
                          : activeCart.isLive
                            ? 'Update Stop & Notify'
                            : 'Go Live & Start Timer'}
                      </span>
                    </button>
                    {activeCart.isLive && (
                      <button
                        type="button"
                        disabled={savingDispatch}
                        onClick={() => void handleGoLive(false)}
                        className="py-2.5 px-4 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200"
                      >
                        End Stop
                      </button>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-7 min-h-[480px] flex flex-col">
                  <InteractiveDistrictMap
                    center={pinCoords}
                    zoom={14}
                    autoPan={autoFollowMap}
                    ownerPinLocation={pinCoords}
                    geolocatorAccuracyMeters={geolocator.accuracyMeters}
                    geolocatorHeadingDeg={geolocator.headingDeg}
                    geolocatorTrail={geolocator.trail}
                    isGeolocatorStreaming={geolocator.isWatching}
                    carts={[activeCart]}
                    nowMs={nowMs}
                    onMapClick={(coords) => {
                      const clean = {
                        lat: Number(coords.lat.toFixed(6)),
                        lng: Number(coords.lng.toFixed(6)),
                      };
                      geolocator.stopWatching();
                      geolocator.setManualPosition(clean);
                      setPinCoords(clean);
                      void geolocator.reverseGeocode(clean).then((addr) => {
                        if (addr && !pinPlaceName) {
                          setPinPlaceName(addr);
                        }
                      });
                    }}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Tip: Start Live GPS Stream to broadcast movement in real time, or click anywhere
                    on the map to pin your stop.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: Profile & Photos */}
            {activeTab === 'profile' && (
              <form
                onSubmit={handleSaveProfile}
                className="bg-white border border-slate-200 rounded-xl p-6 max-w-4xl space-y-5"
              >
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900">
                    Foodcart Profile &amp; Photo Gallery
                  </h3>
                  <p className="text-xs text-slate-500">
                    Manage your public storefront story, gallery photos, and pre-order availability.
                  </p>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Cart Name
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Food Nationality (Optional)
                    </label>
                    <select
                      value={editNationality}
                      onChange={(e) => setEditNationality(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="">None / Not Selected</option>
                      {editNationality &&
                        !FOOD_NATIONALITIES.includes(
                          editNationality as (typeof FOOD_NATIONALITIES)[number]
                        ) && <option value={editNationality}>{editNationality}</option>}
                      {FOOD_NATIONALITIES.map((nat) => (
                        <option key={nat} value={nat}>
                          {nat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Cuisine Type
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={40}
                      value={editCuisine}
                      onChange={(e) => setEditCuisine(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    required
                    rows={3}
                    maxLength={600}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700">
                      Cover &amp; Gallery Photos
                    </label>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>Upload Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleUploadPhoto(e)}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {PRESET_CART_PHOTOS.map((preset) => {
                      const isCover = editPhotoUrl === preset.url;
                      return (
                        <button
                          key={preset.url}
                          type="button"
                          onClick={() => {
                            setEditPhotoUrl(preset.url);
                            setEditGalleryUrls((prev) =>
                              [preset.url, ...prev.filter((u) => u !== preset.url)].slice(0, 5)
                            );
                          }}
                          className={`relative rounded-lg overflow-hidden border-2 aspect-[4/3] ${
                            isCover ? 'border-orange-600' : 'border-slate-200'
                          }`}
                        >
                          <img
                            src={preset.url}
                            alt={preset.label}
                            className="w-full h-full object-cover"
                          />
                          {isCover && (
                            <span className="absolute top-1.5 right-1.5 bg-orange-600 text-white rounded-full p-0.5">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editListed}
                      onChange={(e) => setEditListed(e.target.checked)}
                      className="accent-orange-600"
                    />
                    <span>List foodcart in customer map directory</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editPreOrder}
                      onChange={(e) => setEditPreOrder(e.target.checked)}
                      className="accent-orange-600"
                    />
                    <span>Accept customer pre-orders</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editRequestsEnabled}
                      onChange={(e) => setEditRequestsEnabled(e.target.checked)}
                      className="accent-orange-600"
                    />
                    <span>Accept customer location requests</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </form>
            )}

            {/* TAB 3: Route Schedule */}
            {activeTab === 'route' && (
              <div className="grid lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
                  <div>
                    <h3 className="font-display font-bold text-lg text-slate-900">
                      Route Schedule Builder
                    </h3>
                    <p className="text-xs text-slate-500">
                      Plot your recurring stops so customers know where your cart parks next.
                    </p>
                  </div>

                  <form onSubmit={handleAddStop} className="space-y-3 pb-4 border-b border-slate-200">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Stop Name
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        value={stopLabel}
                        onChange={(e) => setStopLabel(e.target.value)}
                        placeholder="e.g., Harbor Freight Plaza"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Address (search or click map)
                      </label>
                      <PlaceSearchInput
                        initialValue={stopAddress}
                        placeholder="Search stop street address..."
                        onPlaceSelect={({ address, location }) => {
                          setStopAddress(address);
                          setStopCoords(location);
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Days
                        </label>
                        <input
                          type="text"
                          value={stopDay}
                          onChange={(e) => setStopDay(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Arrive
                        </label>
                        <input
                          type="time"
                          value={stopStart}
                          onChange={(e) => setStopStart(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Depart
                        </label>
                        <input
                          type="time"
                          value={stopEnd}
                          onChange={(e) => setStopEnd(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={addingStop}
                      className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                    >
                      {addingStop ? 'Adding Stop...' : 'Add Stop to Schedule'}
                    </button>
                  </form>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-700">
                      Scheduled Stops ({routeStops.length})
                    </h4>
                    {routeStops.length === 0 ? (
                      <p className="text-xs text-slate-500">No route stops scheduled yet.</p>
                    ) : (
                      routeStops.map((stop, idx) => (
                        <div
                          key={stop.id}
                          className="p-3 rounded-lg border border-slate-200 flex items-start justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">
                              <span className="font-mono text-orange-600 mr-1.5">
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              {stop.label}
                            </div>
                            <p className="text-slate-500 mt-0.5">{stop.address}</p>
                            <p className="font-mono text-slate-600 mt-1">
                              {stop.dayOfWeek} · {stop.startTime}–{stop.endTime}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteRouteStop(activeCart.id, stop.id)}
                            aria-label={`Remove ${stop.label}`}
                            className="p-1.5 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="lg:col-span-7 min-h-[480px] flex flex-col">
                  <InteractiveDistrictMap
                    center={stopCoords}
                    zoom={13}
                    ownerPinLocation={stopCoords}
                    routeStops={routeStops}
                    carts={[activeCart]}
                    nowMs={nowMs}
                    onMapClick={(coords) => {
                      setStopCoords({
                        lat: Number(coords.lat.toFixed(6)),
                        lng: Number(coords.lng.toFixed(6)),
                      });
                      if (!stopAddress) {
                        setStopAddress(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
                      }
                    }}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Route paths between stops are computed automatically using Google Maps Routes.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 4: Customer Location Requests (On/Off Toggle + Approve / Deny) */}
            {activeTab === 'requests' && (
              <div className="grid lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="font-display font-bold text-lg text-slate-900">
                        Customer Location Requests
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Turn incoming stop requests on or off, review customer pins, and approve or
                        deny stops for {activeCart.name}.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={togglingRequests}
                      onClick={() => void handleToggleRequestsEnabled()}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        activeCart.requestsEnabled !== false
                          ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                          : 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700'
                      }`}
                    >
                      {togglingRequests
                        ? 'Updating...'
                        : activeCart.requestsEnabled !== false
                          ? 'Turn Off Requests'
                          : 'Turn On Requests'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span>
                      Availability:{' '}
                      <strong
                        className={
                          activeCart.requestsEnabled !== false
                            ? 'text-emerald-700'
                            : 'text-slate-700'
                        }
                      >
                        {activeCart.requestsEnabled !== false
                          ? 'Accepting Customer Location Requests'
                          : 'Requests Paused (Customers Cannot Submit)'}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setRequestFilter('pending')}
                      className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        requestFilter === 'pending'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pending ({pendingCartRequestsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestFilter('all')}
                      className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        requestFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All Requests ({activeCartRequests.length})
                    </button>
                  </div>

                  {filteredCartRequests.length === 0 ? (
                    <div className="py-10 px-4 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                      {requestFilter === 'pending'
                        ? 'No pending customer location requests right now.'
                        : 'No location requests have been submitted for this foodcart yet.'}
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                      {filteredCartRequests.map((req) => {
                        const distFromCart = getDistanceMeters(
                          { lat: activeCart.currentLat, lng: activeCart.currentLng },
                          { lat: req.lat, lng: req.lng }
                        );
                        const isBusy = respondingRequestId === req.id;

                        return (
                          <div
                            key={req.id}
                            className="p-4 rounded-xl border border-slate-200 space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-display font-semibold text-sm text-slate-900 truncate">
                                  {req.locationLabel}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                                  <span className="font-sans text-slate-700 font-medium">
                                    {req.customerName}
                                  </span>
                                  {' · '}
                                  {req.partySize} guests
                                  {' · '}
                                  {formatDistance(distFromCart)} from cart
                                </div>
                              </div>
                              <span
                                className={`font-mono text-xs font-semibold capitalize shrink-0 ${
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

                            <div className="text-xs text-slate-700">
                              <span className="text-slate-500">Window:</span>{' '}
                              <span className="font-medium">{req.requestedTime}</span>
                            </div>

                            {req.note && (
                              <p className="text-xs text-slate-600">
                                <span className="text-slate-500">Customer note:</span> {req.note}
                              </p>
                            )}

                            {req.status === 'pending' ? (
                              <div className="pt-2 border-t border-slate-100 space-y-2">
                                <input
                                  type="text"
                                  maxLength={240}
                                  value={ownerNotesById[req.id] || ''}
                                  onChange={(e) =>
                                    setOwnerNotesById((prev) => ({
                                      ...prev,
                                      [req.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Optional reply note (e.g., See you at 12:15 PM by north curb)"
                                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleRespondToRequest(req, 'approved')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleRespondToRequest(req, 'denied')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-60 whitespace-nowrap"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Deny</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFocusedRequestCoords({ lat: req.lat, lng: req.lng })
                                    }
                                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 whitespace-nowrap"
                                  >
                                    Focus on Map
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                                {req.ownerNote ? (
                                  <span className="text-slate-600">
                                    Reply: <strong className="font-medium">{req.ownerNote}</strong>
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Decision recorded</span>
                                )}
                                {req.status === 'approved' && (
                                  <button
                                    type="button"
                                    onClick={() => handleDispatchToRequest(req)}
                                    className="font-semibold text-orange-600 hover:underline whitespace-nowrap"
                                  >
                                    Load into Live Dispatch →
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-7 min-h-[480px] flex flex-col">
                  <InteractiveDistrictMap
                    center={
                      focusedRequestCoords || {
                        lat: activeCart.currentLat,
                        lng: activeCart.currentLng,
                      }
                    }
                    zoom={focusedRequestCoords ? 15 : 13}
                    carts={[activeCart]}
                    locationRequests={activeCartRequests.filter(
                      (r) => r.status === 'pending' || r.status === 'approved'
                    )}
                    nowMs={nowMs}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Pending customer requests appear as amber map markers and approved requests appear
                    in green alongside your cart pin.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 5: Pre-Order Menu & Queue */}
            {activeTab === 'orders' && (
              <div className="grid lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-lg text-slate-900">
                      Pre-Order Menu Items
                    </h3>
                    <p className="text-xs text-slate-500">
                      Publish items available for customer pre-order pickup.
                    </p>
                  </div>

                  <form
                    onSubmit={handleAddMenuItem}
                    className="space-y-3 pb-4 border-b border-slate-200"
                  >
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Item name (e.g., Carne Asada Trio)"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      maxLength={240}
                      value={itemDesc}
                      onChange={(e) => setItemDesc(e.target.value)}
                      placeholder="Short description..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Price ($)</label>
                        <input
                          type="number"
                          step="0.25"
                          min="0.50"
                          required
                          value={itemPriceDollars}
                          onChange={(e) => setItemPriceDollars(e.target.value)}
                          className="w-full px-3 py-1.5 text-sm font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Prep (min)</label>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          required
                          value={itemPrepMin}
                          onChange={(e) => setItemPrepMin(e.target.value)}
                          className="w-full px-3 py-1.5 text-sm font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={addingItem}
                      className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                    >
                      {addingItem ? 'Adding...' : 'Add Menu Item'}
                    </button>
                  </form>

                  <div className="divide-y divide-slate-100">
                    {menuItems.length === 0 ? (
                      <p className="text-xs text-slate-500">No menu items added yet.</p>
                    ) : (
                      menuItems.map((item) => (
                        <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900">{item.name}</div>
                            {item.description && (
                              <p className="text-xs text-slate-500">{item.description}</p>
                            )}
                            <p className="text-xs font-mono text-slate-700 mt-1">
                              {formatCurrency(item.priceCents)} · {item.prepMinutes}m
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                void toggleMenuItemAvailability(
                                  activeCart.id,
                                  item.id,
                                  !item.available
                                )
                              }
                              className={`px-2 py-1 text-[11px] font-medium rounded border ${
                                item.available
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {item.available ? 'In Stock' : 'Sold Out'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteMenuItem(activeCart.id, item.id)}
                              aria-label={`Delete ${item.name}`}
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold text-lg text-slate-900">
                        Incoming Pre-Order Queue
                      </h3>
                      <p className="text-xs text-slate-500">
                        Real-time pickup orders for {activeCart.name}.
                      </p>
                    </div>
                    <span className="font-mono text-xs text-slate-500">
                      {activeCartOrders.length} total
                    </span>
                  </div>

                  {activeCartOrders.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                      No customer pre-orders received yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeCartOrders.map((ord) => {
                        const isTerminal =
                          ord.status === 'picked_up' || ord.status === 'cancelled';
                        return (
                          <div
                            key={ord.id}
                            className="p-4 rounded-xl border border-slate-200 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <span className="font-display font-semibold text-sm text-slate-900">
                                  {ord.customerName}
                                </span>
                                <span className="mx-2 text-slate-300">·</span>
                                <span className="font-mono text-xs font-semibold text-slate-900">
                                  {formatCurrency(ord.totalCents)}
                                </span>
                              </div>
                              <span className="font-mono text-xs font-semibold uppercase text-orange-600">
                                {ord.status.replace('_', ' ')}
                              </span>
                            </div>

                            <p className="text-sm text-slate-700">{ord.itemsSummary}</p>
                            {ord.pickupNote && (
                              <p className="text-xs text-slate-500">Note: {ord.pickupNote}</p>
                            )}

                            {!isTerminal && (
                              <div className="pt-2 flex flex-wrap gap-2">
                                {ord.status === 'pending' && (
                                  <button
                                    type="button"
                                    onClick={() => void updateOrderStatus(ord.id, 'preparing')}
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                                  >
                                    Start Preparing
                                  </button>
                                )}
                                {ord.status === 'preparing' && (
                                  <button
                                    type="button"
                                    onClick={() => void updateOrderStatus(ord.id, 'ready')}
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700"
                                  >
                                    Mark Ready for Pickup
                                  </button>
                                )}
                                {(ord.status === 'preparing' || ord.status === 'ready') && (
                                  <button
                                    type="button"
                                    onClick={() => void updateOrderStatus(ord.id, 'picked_up')}
                                    className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                                  >
                                    Complete Pickup
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void updateOrderStatus(ord.id, 'cancelled')}
                                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};
