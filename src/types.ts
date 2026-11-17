import { Timestamp } from 'firebase/firestore';

export type WorkspaceMode = 'landing' | 'owner' | 'customer' | 'geolocator';

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  rolePreference: 'owner' | 'customer';
  notificationsEnabled: boolean;
  defaultRadiusMeters: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FavoriteCart {
  userId: string;
  cartId: string;
  cartName: string;
  createdAt?: Timestamp;
}

export interface Foodcart {
  id: string;
  ownerId: string;
  name: string;
  foodNationality?: string;
  cuisine: string;
  description: string;
  photoUrl: string;
  galleryUrls: string[];
  isListed: boolean;
  isLive: boolean;
  preOrderEnabled: boolean;
  requestsEnabled?: boolean;
  currentLat: number;
  currentLng: number;
  currentPlaceName: string;
  timerMinutes: number;
  timerExpiresAtMs: number;
  broadcastMessage: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FoodcartTelemetry {
  cartId: string;
  ownerId: string;
  isPublic: boolean;
  isStreaming: boolean;
  lat: number;
  lng: number;
  accuracyMeters: number;
  headingDeg: number;
  speedMps: number;
  placeLabel: string;
  pingCount: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MenuItem {
  id: string;
  cartId: string;
  ownerId: string;
  isPublic: boolean;
  name: string;
  description: string;
  priceCents: number;
  prepMinutes: number;
  available: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RouteStop {
  id: string;
  cartId: string;
  ownerId: string;
  isPublic: boolean;
  orderIndex: number;
  label: string;
  address: string;
  lat: number;
  lng: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'picked_up' | 'cancelled';

export interface PreOrder {
  id: string;
  cartId: string;
  cartName: string;
  ownerId: string;
  customerId: string;
  customerName: string;
  itemsSummary: string;
  itemCount: number;
  totalCents: number;
  pickupNote: string;
  status: OrderStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ProximityAlert {
  id: string;
  cartId: string;
  cartName: string;
  ownerId: string;
  isPublic: boolean;
  lat: number;
  lng: number;
  placeName: string;
  message: string;
  timerMinutes: number;
  createdAt?: Timestamp;
}

export type CartRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface CartLocationRequest {
  id: string;
  cartId: string;
  cartName: string;
  ownerId: string;
  customerId: string;
  customerName: string;
  locationLabel: string;
  lat: number;
  lng: number;
  requestedTime: string;
  partySize: number;
  note: string;
  ownerNote: string;
  status: CartRequestStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
