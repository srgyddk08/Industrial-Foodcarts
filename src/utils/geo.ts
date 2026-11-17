import { LatLngLiteral } from '../types';

export const DEFAULT_CENTER: LatLngLiteral = {
  lat: 45.5202,
  lng: -122.6742,
};

export const PRESET_CART_PHOTOS = [
  {
    label: 'Foundry Tacos',
    url: '/src/assets/images/cart_foundry_tacos_1794804206048.jpg',
  },
  {
    label: 'Ironworks Espresso',
    url: '/src/assets/images/cart_ironworks_espresso_1794804206295.jpg',
  },
  {
    label: 'Gantry Ramen',
    url: '/src/assets/images/cart_gantry_ramen_1794804208484.jpg',
  },
  {
    label: 'Rivet Smashburger',
    url: '/src/assets/images/cart_rivet_smashburger_1794804207462.jpg',
  },
  {
    label: 'Steel Flagship Fleet',
    url: '/src/assets/images/industrial_steel_foodcart_1794805689037.jpg',
  },
];

export const HERO_FLEET_IMAGE = '/src/assets/images/industrial_steel_foodcart_1794805689037.jpg';

export const FOOD_NATIONALITIES = [
  'Mexican',
  'Japanese',
  'American',
  'Korean',
  'Thai',
  'Italian',
  'Vietnamese',
  'Indian',
  'Mediterranean',
  'Middle Eastern',
  'Chinese',
  'Greek',
  'Caribbean',
  'Ethiopian',
  'Filipino',
  'Peruvian',
  'French',
  'Brazilian',
  'International / Fusion',
] as const;

export function getCartNationality(cart: {
  foodNationality?: string;
}): string {
  return (cart.foodNationality ?? '').trim();
}

export function getDistanceMeters(a: LatLngLiteral, b: LatLngLiteral): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.15) {
    const feet = Math.round(meters * 3.28084);
    return `${feet} ft`;
  }
  return `${miles.toFixed(miles < 10 ? 2 : 1)} mi`;
}

export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatCountdown(expiresAtMs: number, nowMs: number): {
  label: string;
  isExpired: boolean;
  isUrgent: boolean;
} {
  if (!expiresAtMs || expiresAtMs <= 0) {
    return { label: 'No timer', isExpired: false, isUrgent: false };
  }
  const diff = expiresAtMs - nowMs;
  if (diff <= 0) {
    return { label: 'Stop ended', isExpired: true, isUrgent: false };
  }
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const label =
    hours > 0
      ? `${hours}h ${pad(minutes)}m ${pad(seconds)}s`
      : `${pad(minutes)}m ${pad(seconds)}s`;
  return {
    label,
    isExpired: false,
    isUrgent: diff <= 15 * 60 * 1000,
  };
}

export async function compressImageToDataUrl(file: File, maxBytes = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 900;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > maxBytes && quality > 0.3) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > maxBytes) {
          reject(new Error('Image is too large after compression. Choose a smaller photo.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || `id_${Date.now()}`;
}

export function getBearingDeg(from: LatLngLiteral, to: LatLngLiteral): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function formatHeading(deg: number | null | undefined): string {
  if (deg === null || deg === undefined || Number.isNaN(deg) || deg < 0) {
    return 'Stationary';
  }
  const normalized = ((deg % 360) + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const cardinal = dirs[Math.round(normalized / 45) % 8];
  return `${Math.round(normalized).toString().padStart(3, '0')}° ${cardinal}`;
}

export function formatSpeed(speedMps: number | null | undefined): string {
  if (speedMps === null || speedMps === undefined || Number.isNaN(speedMps) || speedMps < 0) {
    return '0.0 mph';
  }
  const mph = speedMps * 2.23694;
  return `${mph.toFixed(1)} mph`;
}

export function formatAccuracy(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || Number.isNaN(meters) || meters <= 0) {
    return '--';
  }
  if (meters >= 1000) {
    return `±${(meters / 1000).toFixed(2)} km`;
  }
  return `±${Math.round(meters)} m`;
}
