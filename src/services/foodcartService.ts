import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CartLocationRequest,
  CartRequestStatus,
  FavoriteCart,
  Foodcart,
  FoodcartTelemetry,
  LatLngLiteral,
  MenuItem,
  OrderStatus,
  PreOrder,
  ProximityAlert,
  RouteStop,
  UserProfile,
} from '../types';
import { PRESET_CART_PHOTOS } from '../utils/geo';

function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export async function ensureUserProfile(
  userId: string,
  displayName: string,
  rolePreference: 'owner' | 'customer'
): Promise<UserProfile> {
  const ref = doc(db, 'users', userId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    const payload = {
      userId,
      displayName: (displayName || 'User').slice(0, 80),
      rolePreference,
      notificationsEnabled: true,
      defaultRadiusMeters: 3218,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    return {
      userId,
      displayName: payload.displayName,
      rolePreference,
      notificationsEnabled: true,
      defaultRadiusMeters: 3218,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
  }
}

export async function updateUserPreferences(
  userId: string,
  updates: {
    displayName: string;
    rolePreference: 'owner' | 'customer';
    notificationsEnabled: boolean;
    defaultRadiusMeters: number;
  }
) {
  const ref = doc(db, 'users', userId);
  try {
    await updateDoc(ref, {
      displayName: updates.displayName.trim().slice(0, 80) || 'User',
      rolePreference: updates.rolePreference,
      notificationsEnabled: updates.notificationsEnabled,
      defaultRadiusMeters: Math.min(50000, Math.max(250, updates.defaultRadiusMeters)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
  }
}

export function subscribePublicFoodcarts(
  onData: (carts: Foodcart[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, 'foodcarts'), where('isListed', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const list: Foodcart[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Foodcart, 'id'>),
      }));
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'foodcarts');
    }
  );
}

export function subscribeOwnerFoodcarts(
  ownerId: string,
  onData: (carts: Foodcart[]) => void
) {
  const q = query(collection(db, 'foodcarts'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: Foodcart[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Foodcart, 'id'>),
      }));
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'foodcarts');
    }
  );
}

export async function createFoodcart(
  ownerId: string,
  input: {
    name: string;
    foodNationality?: string;
    cuisine: string;
    description: string;
    photoUrl: string;
    galleryUrls: string[];
    preOrderEnabled: boolean;
    requestsEnabled?: boolean;
    currentLat: number;
    currentLng: number;
    currentPlaceName: string;
  }
): Promise<string> {
  const id = generateId('cart');
  const ref = doc(db, 'foodcarts', id);
  const safeGallery = (input.galleryUrls.length > 0 ? input.galleryUrls : [input.photoUrl]).slice(0, 5);
  try {
    await setDoc(ref, {
      ownerId,
      name: input.name.trim().slice(0, 80),
      foodNationality: (input.foodNationality ?? '').trim().slice(0, 40),
      cuisine: input.cuisine.trim().slice(0, 40),
      description: input.description.trim().slice(0, 600),
      photoUrl: input.photoUrl.slice(0, 200000),
      galleryUrls: safeGallery,
      isListed: true,
      isLive: false,
      preOrderEnabled: input.preOrderEnabled,
      requestsEnabled: input.requestsEnabled ?? true,
      currentLat: input.currentLat,
      currentLng: input.currentLng,
      currentPlaceName: input.currentPlaceName.trim().slice(0, 160),
      timerMinutes: 0,
      timerExpiresAtMs: 0,
      broadcastMessage: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `foodcarts/${id}`);
  }
}

export async function updateFoodcartProfile(
  cartId: string,
  input: {
    name: string;
    foodNationality?: string;
    cuisine: string;
    description: string;
    photoUrl: string;
    galleryUrls: string[];
    isListed: boolean;
    preOrderEnabled: boolean;
    requestsEnabled?: boolean;
  }
) {
  const ref = doc(db, 'foodcarts', cartId);
  const safeGallery = (input.galleryUrls.length > 0 ? input.galleryUrls : [input.photoUrl]).slice(0, 5);
  try {
    await updateDoc(ref, {
      name: input.name.trim().slice(0, 80),
      foodNationality: (input.foodNationality ?? '').trim().slice(0, 40),
      cuisine: input.cuisine.trim().slice(0, 40),
      description: input.description.trim().slice(0, 600),
      photoUrl: input.photoUrl.slice(0, 200000),
      galleryUrls: safeGallery,
      isListed: input.isListed,
      preOrderEnabled: input.preOrderEnabled,
      requestsEnabled: input.requestsEnabled ?? true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `foodcarts/${cartId}`);
  }
}

export async function toggleFoodcartRequestsEnabled(cartId: string, requestsEnabled: boolean) {
  const ref = doc(db, 'foodcarts', cartId);
  try {
    await updateDoc(ref, {
      requestsEnabled,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `foodcarts/${cartId}`);
  }
}

export async function updateFoodcartLiveLocationAndNotify(
  cart: Foodcart,
  input: {
    isLive: boolean;
    currentLat: number;
    currentLng: number;
    currentPlaceName: string;
    timerMinutes: number;
    broadcastMessage: string;
    sendPushAlert: boolean;
  }
) {
  const cartRef = doc(db, 'foodcarts', cart.id);
  const safeMinutes = Math.min(720, Math.max(0, Math.round(input.timerMinutes)));
  const timerExpiresAtMs =
    input.isLive && safeMinutes > 0 ? Date.now() + safeMinutes * 60 * 1000 : 0;
  const placeName = input.currentPlaceName.trim().slice(0, 160) || 'Current Stop';
  const message =
    input.broadcastMessage.trim().slice(0, 200) ||
    `${cart.name} is now open at ${placeName}${safeMinutes > 0 ? ` for ${safeMinutes} min` : ''}.`;

  try {
    await updateDoc(cartRef, {
      isLive: input.isLive,
      currentLat: input.currentLat,
      currentLng: input.currentLng,
      currentPlaceName: placeName,
      timerMinutes: safeMinutes,
      timerExpiresAtMs,
      broadcastMessage: message,
      updatedAt: serverTimestamp(),
    });

    if (input.isLive && input.sendPushAlert) {
      const alertId = generateId('alert');
      await setDoc(doc(db, 'proximityAlerts', alertId), {
        cartId: cart.id,
        cartName: cart.name.slice(0, 80),
        ownerId: cart.ownerId,
        isPublic: true,
        lat: input.currentLat,
        lng: input.currentLng,
        placeName,
        message,
        timerMinutes: safeMinutes,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `foodcarts/${cart.id}`);
  }
}

export async function deleteFoodcart(cartId: string) {
  try {
    await deleteDoc(doc(db, 'foodcarts', cartId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `foodcarts/${cartId}`);
  }
}

// Live GPS Telemetry Stream
export function subscribeCartTelemetry(
  cartId: string,
  onData: (telemetry: FoodcartTelemetry | null) => void
) {
  const ref = doc(db, 'foodcarts', cartId, 'telemetry', 'live');
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? (snap.data() as FoodcartTelemetry) : null);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `foodcarts/${cartId}/telemetry/live`);
    }
  );
}

export async function publishCartTelemetry(
  cart: Foodcart,
  input: {
    isStreaming: boolean;
    lat: number;
    lng: number;
    accuracyMeters: number;
    headingDeg: number | null;
    speedMps: number | null;
    placeLabel: string;
    pingCount: number;
    syncCartLocation?: boolean;
  }
) {
  const telemetryRef = doc(db, 'foodcarts', cart.id, 'telemetry', 'live');
  const safeLat = Math.min(90, Math.max(-90, Number(input.lat.toFixed(6))));
  const safeLng = Math.min(180, Math.max(-180, Number(input.lng.toFixed(6))));
  const safeAccuracy = Math.min(100000, Math.max(0, Math.round(input.accuracyMeters || 0)));
  const safeHeading =
    input.headingDeg === null || Number.isNaN(input.headingDeg)
      ? -1
      : Math.min(360, Math.max(0, Number(input.headingDeg.toFixed(1))));
  const safeSpeed =
    input.speedMps === null || Number.isNaN(input.speedMps)
      ? 0
      : Math.min(200, Math.max(0, Number(input.speedMps.toFixed(2))));
  const safeLabel = input.placeLabel.trim().slice(0, 160);
  const safePings = Math.min(10000000, Math.max(0, Math.round(input.pingCount)));

  try {
    const existingSnap = await getDoc(telemetryRef);
    if (!existingSnap.exists()) {
      await setDoc(telemetryRef, {
        cartId: cart.id,
        ownerId: cart.ownerId,
        isPublic: cart.isListed,
        isStreaming: input.isStreaming,
        lat: safeLat,
        lng: safeLng,
        accuracyMeters: safeAccuracy,
        headingDeg: safeHeading,
        speedMps: safeSpeed,
        placeLabel: safeLabel,
        pingCount: safePings,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(telemetryRef, {
        isPublic: cart.isListed,
        isStreaming: input.isStreaming,
        lat: safeLat,
        lng: safeLng,
        accuracyMeters: safeAccuracy,
        headingDeg: safeHeading,
        speedMps: safeSpeed,
        placeLabel: safeLabel,
        pingCount: safePings,
        updatedAt: serverTimestamp(),
      });
    }

    if (input.syncCartLocation) {
      await updateDoc(doc(db, 'foodcarts', cart.id), {
        currentLat: safeLat,
        currentLng: safeLng,
        currentPlaceName: safeLabel || cart.currentPlaceName || 'Live GPS Stream',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `foodcarts/${cart.id}/telemetry/live`);
  }
}

// Menu Items
export function subscribeMenuItems(
  cartId: string,
  onData: (items: MenuItem[]) => void
) {
  const q = query(
    collection(db, 'foodcarts', cartId, 'menuItems'),
    where('isPublic', '==', true)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MenuItem, 'id'>),
      }));
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, `foodcarts/${cartId}/menuItems`);
    }
  );
}

export async function addMenuItem(
  cartId: string,
  ownerId: string,
  input: {
    name: string;
    description: string;
    priceCents: number;
    prepMinutes: number;
  }
) {
  const itemId = generateId('item');
  const ref = doc(db, 'foodcarts', cartId, 'menuItems', itemId);
  try {
    await setDoc(ref, {
      cartId,
      ownerId,
      isPublic: true,
      name: input.name.trim().slice(0, 80),
      description: input.description.trim().slice(0, 240),
      priceCents: Math.min(500000, Math.max(50, Math.round(input.priceCents))),
      prepMinutes: Math.min(120, Math.max(1, Math.round(input.prepMinutes))),
      available: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `foodcarts/${cartId}/menuItems/${itemId}`);
  }
}

export async function toggleMenuItemAvailability(
  cartId: string,
  itemId: string,
  available: boolean
) {
  const ref = doc(db, 'foodcarts', cartId, 'menuItems', itemId);
  try {
    await updateDoc(ref, {
      available,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `foodcarts/${cartId}/menuItems/${itemId}`);
  }
}

export async function deleteMenuItem(cartId: string, itemId: string) {
  try {
    await deleteDoc(doc(db, 'foodcarts', cartId, 'menuItems', itemId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `foodcarts/${cartId}/menuItems/${itemId}`);
  }
}

// Route Stops
export function subscribeRouteStops(
  cartId: string,
  onData: (stops: RouteStop[]) => void
) {
  const q = query(
    collection(db, 'foodcarts', cartId, 'routeStops'),
    where('isPublic', '==', true)
  );
  return onSnapshot(
    q,
    (snap) => {
      const stops = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RouteStop, 'id'>),
        }))
        .sort((a, b) => a.orderIndex - b.orderIndex);
      onData(stops);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, `foodcarts/${cartId}/routeStops`);
    }
  );
}

export async function addRouteStop(
  cartId: string,
  ownerId: string,
  input: {
    orderIndex: number;
    label: string;
    address: string;
    lat: number;
    lng: number;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  }
) {
  const stopId = generateId('stop');
  const ref = doc(db, 'foodcarts', cartId, 'routeStops', stopId);
  try {
    await setDoc(ref, {
      cartId,
      ownerId,
      isPublic: true,
      orderIndex: Math.min(30, Math.max(0, Math.round(input.orderIndex))),
      label: input.label.trim().slice(0, 120),
      address: input.address.trim().slice(0, 200),
      lat: input.lat,
      lng: input.lng,
      dayOfWeek: input.dayOfWeek.trim().slice(0, 40) || 'Mon–Fri',
      startTime: input.startTime.trim().slice(0, 20) || '11:00',
      endTime: input.endTime.trim().slice(0, 20) || '14:00',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `foodcarts/${cartId}/routeStops/${stopId}`);
  }
}

export async function deleteRouteStop(cartId: string, stopId: string) {
  try {
    await deleteDoc(doc(db, 'foodcarts', cartId, 'routeStops', stopId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `foodcarts/${cartId}/routeStops/${stopId}`);
  }
}

// Favorites
export function subscribeFavorites(
  userId: string,
  onData: (favorites: FavoriteCart[]) => void
) {
  const q = query(
    collection(db, 'users', userId, 'favorites'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as FavoriteCart);
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${userId}/favorites`);
    }
  );
}

export async function toggleFavoriteCart(
  userId: string,
  cartId: string,
  cartName: string,
  currentlyFavorite: boolean
) {
  const ref = doc(db, 'users', userId, 'favorites', cartId);
  try {
    if (currentlyFavorite) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        userId,
        cartId,
        cartName: cartName.slice(0, 80),
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}/favorites/${cartId}`);
  }
}

// Pre-Orders
export async function createPreOrder(input: {
  cart: Foodcart;
  customerId: string;
  customerName: string;
  itemsSummary: string;
  itemCount: number;
  totalCents: number;
  pickupNote: string;
}): Promise<string> {
  const orderId = generateId('ord');
  const ref = doc(db, 'orders', orderId);
  try {
    await setDoc(ref, {
      cartId: input.cart.id,
      cartName: input.cart.name.slice(0, 80),
      ownerId: input.cart.ownerId,
      customerId: input.customerId,
      customerName: input.customerName.trim().slice(0, 80) || 'Customer',
      itemsSummary: input.itemsSummary.trim().slice(0, 500),
      itemCount: Math.min(50, Math.max(1, input.itemCount)),
      totalCents: Math.min(2000000, Math.max(50, Math.round(input.totalCents))),
      pickupNote: input.pickupNote.trim().slice(0, 200),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return orderId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
  }
}

export function subscribeCustomerOrders(
  customerId: string,
  onData: (orders: PreOrder[]) => void
) {
  const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PreOrder, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'orders');
    }
  );
}

export function subscribeOwnerOrders(
  ownerId: string,
  onData: (orders: PreOrder[]) => void
) {
  const q = query(collection(db, 'orders'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PreOrder, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'orders');
    }
  );
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const ref = doc(db, 'orders', orderId);
  try {
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
  }
}

// Customer Foodcart Location Requests
export async function createCartLocationRequest(input: {
  cart: Foodcart;
  customerId: string;
  customerName: string;
  locationLabel: string;
  lat: number;
  lng: number;
  requestedTime: string;
  partySize: number;
  note: string;
}): Promise<string> {
  const requestId = generateId('req');
  const ref = doc(db, 'cartRequests', requestId);
  try {
    await setDoc(ref, {
      cartId: input.cart.id,
      cartName: input.cart.name.slice(0, 80),
      ownerId: input.cart.ownerId,
      customerId: input.customerId,
      customerName: input.customerName.trim().slice(0, 80) || 'Customer',
      locationLabel: input.locationLabel.trim().slice(0, 160) || 'Pinned Location',
      lat: Math.min(90, Math.max(-90, Number(input.lat.toFixed(6)))),
      lng: Math.min(180, Math.max(-180, Number(input.lng.toFixed(6)))),
      requestedTime: input.requestedTime.trim().slice(0, 60) || 'Today Lunch',
      partySize: Math.min(500, Math.max(1, Math.round(input.partySize || 1))),
      note: input.note.trim().slice(0, 240),
      ownerNote: '',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return requestId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `cartRequests/${requestId}`);
  }
}

export function subscribeCustomerLocationRequests(
  customerId: string,
  onData: (requests: CartLocationRequest[]) => void
) {
  const q = query(collection(db, 'cartRequests'), where('customerId', '==', customerId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<CartLocationRequest, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'cartRequests');
    }
  );
}

export function subscribeOwnerLocationRequests(
  ownerId: string,
  onData: (requests: CartLocationRequest[]) => void
) {
  const q = query(collection(db, 'cartRequests'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<CartLocationRequest, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'cartRequests');
    }
  );
}

export async function respondToCartLocationRequest(
  requestId: string,
  decision: Extract<CartRequestStatus, 'approved' | 'denied'>,
  ownerNote: string
) {
  const ref = doc(db, 'cartRequests', requestId);
  try {
    await updateDoc(ref, {
      status: decision,
      ownerNote: ownerNote.trim().slice(0, 240),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `cartRequests/${requestId}`);
  }
}

export async function cancelCartLocationRequest(requestId: string) {
  const ref = doc(db, 'cartRequests', requestId);
  try {
    await updateDoc(ref, {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `cartRequests/${requestId}`);
  }
}

// Proximity Push Notification Alerts
export function subscribeProximityAlerts(onData: (alerts: ProximityAlert[]) => void) {
  const q = query(
    collection(db, 'proximityAlerts'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ProximityAlert, 'id'>),
      }));
      onData(list);
    },
    () => {
      // Fallback query without orderBy in case composite index is still building
      const fallbackQ = query(
        collection(db, 'proximityAlerts'),
        where('isPublic', '==', true)
      );
      onSnapshot(
        fallbackQ,
        (snap) => {
          const list = snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<ProximityAlert, 'id'>),
            }))
            .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
          onData(list);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'proximityAlerts');
        }
      );
    }
  );
}

// Seed 4 Industrial Foodcarts into Firestore around a chosen center (for authenticated evaluation)
export async function seedDistrictFleet(ownerId: string, center: LatLngLiteral): Promise<void> {
  const now = Date.now();
  const templates = [
    {
      name: 'Foundry Street Tacos',
      foodNationality: 'Mexican',
      cuisine: 'Sonoran Wood-Fired',
      description:
        'Brushed-steel mobile taqueria serving mesquite-charred carne asada, hand-pressed corn tortillas, and roasted habanero salsas.',
      photoUrl: PRESET_CART_PHOTOS[0].url,
      latOffset: 0.0042,
      lngOffset: -0.0058,
      placeName: 'North Foundry Yard & 14th',
      timerMinutes: 110,
      broadcastMessage: 'Grill is hot at North Foundry Yard — fresh carne asada & al pastor ready for pre-order.',
      menu: [
        { name: 'Carne Asada Trio', description: 'Three mesquite-grilled steak tacos with cilantro & lime.', priceCents: 1350, prepMinutes: 8 },
        { name: 'Smoked Brisket Quesadilla', description: 'Oaxaca cheese, charred onions, salsa macha.', priceCents: 1450, prepMinutes: 10 },
        { name: 'Horchata Cold Brew', description: 'House cinnamon rice milk over espresso.', priceCents: 550, prepMinutes: 3 },
      ],
      stops: [
        { label: 'North Foundry Yard', address: '1420 NW Industrial Way', latOffset: 0.0042, lngOffset: -0.0058, dayOfWeek: 'Mon–Fri', startTime: '11:00', endTime: '14:30' },
        { label: 'Riverfront Machine Works', address: '810 SW River Pkwy', latOffset: -0.0065, lngOffset: 0.0045, dayOfWeek: 'Mon–Fri', startTime: '17:00', endTime: '21:00' },
      ],
    },
    {
      name: 'Ironworks Espresso & Bakehouse',
      foodNationality: 'French',
      cuisine: 'Specialty Coffee & Pastry',
      description:
        'Matte-charcoal mobile espresso bar pulling single-origin shots on a brass lever machine with laminated sourdough pastries.',
      photoUrl: PRESET_CART_PHOTOS[1].url,
      latOffset: -0.0031,
      lngOffset: 0.0062,
      placeName: 'Central Depot Plaza',
      timerMinutes: 75,
      broadcastMessage: 'Morning bake & espresso service live at Central Depot Plaza.',
      menu: [
        { name: 'Foundry Cortado', description: 'Double ristretto with velvety microfoam.', priceCents: 475, prepMinutes: 4 },
        { name: 'Brown Butter Croissant', description: '72-hour laminated sourdough pastry.', priceCents: 525, prepMinutes: 2 },
        { name: 'Maple Oat Cold Foam Latte', description: 'Chilled single-origin espresso with sea salt.', priceCents: 625, prepMinutes: 4 },
      ],
      stops: [
        { label: 'Central Depot Plaza', address: '420 Main Transit Plaza', latOffset: -0.0031, lngOffset: 0.0062, dayOfWeek: 'Daily', startTime: '07:00', endTime: '12:00' },
        { label: 'Freight Terminal Market', address: '115 SE Dock St', latOffset: -0.0095, lngOffset: -0.0034, dayOfWeek: 'Sat–Sun', startTime: '12:30', endTime: '16:00' },
      ],
    },
    {
      name: 'Gantry Midnight Ramen',
      foodNationality: 'Japanese',
      cuisine: 'Tonkotsu & Izakaya',
      description:
        'Stainless steel noodle station simmering 18-hour pork bone broth, torched chashu belly, and crisp chili oil.',
      photoUrl: PRESET_CART_PHOTOS[2].url,
      latOffset: 0.0085,
      lngOffset: 0.0074,
      placeName: 'East Gantry Alley',
      timerMinutes: 145,
      broadcastMessage: '18-hour Tonkotsu broth pouring now in East Gantry Alley.',
      menu: [
        { name: 'Black Garlic Tonkotsu', description: 'Chashu pork, ajitama egg, bamboo, charred scallion.', priceCents: 1650, prepMinutes: 9 },
        { name: 'Spicy Miso Mazemen', description: 'Brothless wheat noodles, sesame tare, crispy shallots.', priceCents: 1500, prepMinutes: 8 },
        { name: 'Yuzu Karaage Bites', description: 'Double-fried ginger soy chicken with yuzu mayo.', priceCents: 950, prepMinutes: 7 },
      ],
      stops: [
        { label: 'East Gantry Alley', address: '930 E Gantry Ave', latOffset: 0.0085, lngOffset: 0.0074, dayOfWeek: 'Wed–Sun', startTime: '17:30', endTime: '23:30' },
        { label: 'Warehouse District Pier', address: '205 Dockside Way', latOffset: 0.012, lngOffset: -0.004, dayOfWeek: 'Fri–Sat', startTime: '12:00', endTime: '15:30' },
      ],
    },
    {
      name: 'Rivet Smashburger Co.',
      foodNationality: 'American',
      cuisine: 'Flat-Top Burgers',
      description:
        'Riveted aluminum burger trailer searing dry-aged beef patties crispy on a 450°F steel plancha with tallow-fried crinkle fries.',
      photoUrl: PRESET_CART_PHOTOS[3].url,
      latOffset: -0.0078,
      lngOffset: -0.0091,
      placeName: 'South Rail Yard',
      timerMinutes: 90,
      broadcastMessage: 'Fresh dry-aged patties hitting the plancha at South Rail Yard!',
      menu: [
        { name: 'Double Rivet Smash', description: 'Two crispy patties, aged cheddar, pickled jalapeño, house sauce.', priceCents: 1300, prepMinutes: 7 },
        { name: 'Tallow Crinkle Fries', description: 'Sea salt, rosemary, smoked paprika aioli.', priceCents: 550, prepMinutes: 5 },
      ],
      stops: [
        { label: 'South Rail Yard', address: '650 S Rail Spur', latOffset: -0.0078, lngOffset: -0.0091, dayOfWeek: 'Tue–Sun', startTime: '11:30', endTime: '20:00' },
      ],
    },
  ];

  const batch = writeBatch(db);
  for (const t of templates) {
    const cartId = generateId('cart');
    const cartRef = doc(db, 'foodcarts', cartId);
    const lat = Number((center.lat + t.latOffset).toFixed(6));
    const lng = Number((center.lng + t.lngOffset).toFixed(6));

    batch.set(cartRef, {
      ownerId,
      name: t.name,
      foodNationality: t.foodNationality,
      cuisine: t.cuisine,
      description: t.description,
      photoUrl: t.photoUrl,
      galleryUrls: [t.photoUrl],
      isListed: true,
      isLive: true,
      preOrderEnabled: true,
      requestsEnabled: true,
      currentLat: lat,
      currentLng: lng,
      currentPlaceName: t.placeName,
      timerMinutes: t.timerMinutes,
      timerExpiresAtMs: now + t.timerMinutes * 60 * 1000,
      broadcastMessage: t.broadcastMessage,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    t.menu.forEach((m) => {
      const itemRef = doc(db, 'foodcarts', cartId, 'menuItems', generateId('item'));
      batch.set(itemRef, {
        cartId,
        ownerId,
        isPublic: true,
        name: m.name,
        description: m.description,
        priceCents: m.priceCents,
        prepMinutes: m.prepMinutes,
        available: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    t.stops.forEach((s, idx) => {
      const stopRef = doc(db, 'foodcarts', cartId, 'routeStops', generateId('stop'));
      batch.set(stopRef, {
        cartId,
        ownerId,
        isPublic: true,
        orderIndex: idx,
        label: s.label,
        address: s.address,
        lat: Number((center.lat + s.latOffset).toFixed(6)),
        lng: Number((center.lng + s.lngOffset).toFixed(6)),
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    const alertRef = doc(db, 'proximityAlerts', generateId('alert'));
    batch.set(alertRef, {
      cartId,
      cartName: t.name,
      ownerId,
      isPublic: true,
      lat,
      lng,
      placeName: t.placeName,
      message: t.broadcastMessage,
      timerMinutes: t.timerMinutes,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'foodcarts/seedDistrictFleet');
  }
}
