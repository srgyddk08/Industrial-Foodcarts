import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { LatLngLiteral } from '../types';
import { DEFAULT_CENTER, getBearingDeg, getDistanceMeters } from '../utils/geo';

export type GeolocatorStatus = 'idle' | 'acquiring' | 'tracking' | 'error';

export interface RealtimeGeolocatorOptions {
  initialCoords?: LatLngLiteral;
  initialLabel?: string;
  autoReverseGeocode?: boolean;
  maxTrailPoints?: number;
  onFix?: (fix: {
    coords: LatLngLiteral;
    accuracyMeters: number;
    headingDeg: number | null;
    speedMps: number | null;
    timestampMs: number;
  }) => void;
}

export interface RealtimeGeolocatorState {
  status: GeolocatorStatus;
  isWatching: boolean;
  coords: LatLngLiteral;
  accuracyMeters: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  altitudeMeters: number | null;
  lastFixAtMs: number | null;
  fixCount: number;
  totalDistanceMeters: number;
  trail: LatLngLiteral[];
  resolvedAddress: string;
  geocoding: boolean;
  error: string | null;
  startWatching: () => void;
  stopWatching: () => void;
  locateOnce: () => void;
  reverseGeocode: (targetCoords?: LatLngLiteral) => Promise<string | null>;
  setManualPosition: (nextCoords: LatLngLiteral, label?: string) => void;
  clearTrail: () => void;
}

export function useRealtimeGeolocator(
  options: RealtimeGeolocatorOptions = {}
): RealtimeGeolocatorState {
  const {
    initialCoords = DEFAULT_CENTER,
    initialLabel = 'Central Industrial District',
    autoReverseGeocode = false,
    maxTrailPoints = 60,
    onFix,
  } = options;

  const placesLib = useMapsLibrary('places');
  const nearbyUnavailableRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const prevFixRef = useRef<{ coords: LatLngLiteral; timestampMs: number } | null>(null);
  const lastGeocodeCoordsRef = useRef<LatLngLiteral | null>(null);
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  const [status, setStatus] = useState<GeolocatorStatus>('idle');
  const [isWatching, setIsWatching] = useState(false);
  const [coords, setCoords] = useState<LatLngLiteral>(initialCoords);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [speedMps, setSpeedMps] = useState<number | null>(null);
  const [altitudeMeters, setAltitudeMeters] = useState<number | null>(null);
  const [lastFixAtMs, setLastFixAtMs] = useState<number | null>(null);
  const [fixCount, setFixCount] = useState(0);
  const [totalDistanceMeters, setTotalDistanceMeters] = useState(0);
  const [trail, setTrail] = useState<LatLngLiteral[]>([]);
  const [resolvedAddress, setResolvedAddress] = useState(initialLabel);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Uses Places API (New) Place.searchNearby instead of legacy google.maps.Geocoder
  // Ref: https://developers.google.com/maps/documentation/javascript/nearby-search?utm_campaign=gmp_mcp_codeassist_v1_aistudio
  const reverseGeocode = useCallback(
    async (targetCoords?: LatLngLiteral): Promise<string | null> => {
      const point = targetCoords || coords;
      const coordFallback = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;

      if (!placesLib || !placesLib.Place?.searchNearby || nearbyUnavailableRef.current) {
        setResolvedAddress(coordFallback);
        lastGeocodeCoordsRef.current = point;
        return coordFallback;
      }

      setGeocoding(true);
      try {
        const res = await placesLib.Place.searchNearby({
          fields: ['displayName', 'formattedAddress'],
          locationRestriction: {
            center: point,
            radius: 100,
          },
          maxResultCount: 1,
          rankPreference: placesLib.SearchNearbyRankPreference?.DISTANCE,
        });
        const nearest = res.places?.[0];
        const label = nearest?.formattedAddress || nearest?.displayName || coordFallback;
        setResolvedAddress(label);
        lastGeocodeCoordsRef.current = point;
        return label;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        } else if (
          msg.includes('PERMISSION_DENIED') ||
          msg.includes('Billing') ||
          msg.includes('API_KEY')
        ) {
          nearbyUnavailableRef.current = true;
        }
        setResolvedAddress(coordFallback);
        lastGeocodeCoordsRef.current = point;
        return coordFallback;
      } finally {
        setGeocoding(false);
      }
    },
    [coords, placesLib]
  );

  const applyPositionFix = useCallback(
    (pos: GeolocationPosition) => {
      const nextCoords: LatLngLiteral = {
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
      };
      const timestampMs = pos.timestamp || Date.now();
      const prev = prevFixRef.current;

      let computedHeading: number | null =
        pos.coords.heading !== null && !Number.isNaN(pos.coords.heading)
          ? pos.coords.heading
          : null;
      let computedSpeed: number | null =
        pos.coords.speed !== null && !Number.isNaN(pos.coords.speed)
          ? pos.coords.speed
          : null;

      if (prev) {
        const stepMeters = getDistanceMeters(prev.coords, nextCoords);
        const deltaSec = Math.max(0.25, (timestampMs - prev.timestampMs) / 1000);
        if (stepMeters >= 2) {
          setTotalDistanceMeters((d) => d + stepMeters);
          if (computedHeading === null) {
            computedHeading = getBearingDeg(prev.coords, nextCoords);
          }
          if (computedSpeed === null) {
            computedSpeed = stepMeters / deltaSec;
          }
        }
      }

      prevFixRef.current = { coords: nextCoords, timestampMs };

      setCoords(nextCoords);
      setAccuracyMeters(Math.round(pos.coords.accuracy));
      setHeadingDeg(computedHeading);
      setSpeedMps(computedSpeed ?? 0);
      setAltitudeMeters(pos.coords.altitude ?? null);
      setLastFixAtMs(timestampMs);
      setFixCount((c) => c + 1);
      setError(null);
      setStatus('tracking');

      setTrail((prevTrail) => {
        const last = prevTrail[prevTrail.length - 1];
        if (last && getDistanceMeters(last, nextCoords) < 4) {
          return prevTrail;
        }
        return [...prevTrail, nextCoords].slice(-maxTrailPoints);
      });

      if (autoReverseGeocode) {
        const lastGeocoded = lastGeocodeCoordsRef.current;
        if (!lastGeocoded || getDistanceMeters(lastGeocoded, nextCoords) >= 60) {
          void reverseGeocode(nextCoords);
        }
      }

      onFixRef.current?.({
        coords: nextCoords,
        accuracyMeters: pos.coords.accuracy,
        headingDeg: computedHeading,
        speedMps: computedSpeed,
        timestampMs,
      });
    },
    [autoReverseGeocode, maxTrailPoints, reverseGeocode]
  );

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    const message =
      err.code === err.PERMISSION_DENIED
        ? 'Location permission denied. Enable browser location access or pin a point on the map.'
        : err.code === err.TIMEOUT
          ? 'GPS fix timed out. Retrying or click the map to pin manually.'
          : 'GPS signal unavailable. Check device location services or click the map.';
    setError(message);
    setStatus('error');
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);
    setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
  }, []);

  const startWatching = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not supported in this browser.');
      setStatus('error');
      return;
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setError(null);
    setStatus('acquiring');
    setIsWatching(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      applyPositionFix,
      (geoErr) => {
        handlePositionError(geoErr);
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          stopWatching();
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1500,
        timeout: 12000,
      }
    );
  }, [applyPositionFix, handlePositionError, stopWatching]);

  const locateOnce = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not supported in this browser.');
      setStatus('error');
      return;
    }
    setError(null);
    setStatus('acquiring');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPositionFix(pos);
        if (!isWatching) {
          setStatus('idle');
        }
      },
      handlePositionError,
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      }
    );
  }, [applyPositionFix, handlePositionError, isWatching]);

  const setManualPosition = useCallback((nextCoords: LatLngLiteral, label?: string) => {
    const clean = {
      lat: Number(nextCoords.lat.toFixed(6)),
      lng: Number(nextCoords.lng.toFixed(6)),
    };
    setCoords(clean);
    setAccuracyMeters(null);
    setSpeedMps(0);
    setHeadingDeg(null);
    setError(null);
    if (label) {
      setResolvedAddress(label);
    } else {
      setResolvedAddress(`${clean.lat.toFixed(5)}, ${clean.lng.toFixed(5)}`);
    }
  }, []);

  const clearTrail = useCallback(() => {
    setTrail([]);
    setTotalDistanceMeters(0);
    setFixCount(0);
    prevFixRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    status,
    isWatching,
    coords,
    accuracyMeters,
    headingDeg,
    speedMps,
    altitudeMeters,
    lastFixAtMs,
    fixCount,
    totalDistanceMeters,
    trail,
    resolvedAddress,
    geocoding,
    error,
    startWatching,
    stopWatching,
    locateOnce,
    reverseGeocode,
    setManualPosition,
    clearTrail,
  };
}
