import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Circle,
  InfoWindow,
  Map as GoogleMap,
  Polyline,
  useAdvancedMarkerRef,
  useApiIsLoaded,
  useApiLoadingStatus,
  APILoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Clock, MapPin, Navigation, Search, Star } from 'lucide-react';
import { CartLocationRequest, Foodcart, LatLngLiteral, RouteStop } from '../types';
import {
  formatCountdown,
  formatDistance,
  getCartNationality,
  getDistanceMeters,
} from '../utils/geo';

export const MAPS_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];
export const DEMO_MAP_ID = 'DEMO_MAP_ID';

interface PlaceSearchInputProps {
  placeholder?: string;
  initialValue?: string;
  onPlaceSelect: (result: { address: string; label: string; location: LatLngLiteral }) => void;
  className?: string;
}

export const PlaceSearchInput: React.FC<PlaceSearchInputProps> = ({
  placeholder = 'Search street address or district...',
  initialValue = '',
  onPlaceSelect,
  className = '',
}) => {
  const placesLib = useMapsLibrary('places');
  const [inputValue, setInputValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (!placesLib || !inputValue.trim() || !isOpen) {
      setSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: inputValue,
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res.suggestions || []);
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          if (!cancelled) setSuggestions([]);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, inputValue, isOpen]);

  const handleSelect = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!placesLib || !suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      const loc = place.location;
      if (loc) {
        const coords = { lat: loc.lat(), lng: loc.lng() };
        const address = place.formattedAddress || suggestion.placePrediction.text.text;
        const label = place.displayName || suggestion.placePrediction.mainText?.text || address;
        setInputValue(address);
        setIsOpen(false);
        setSuggestions([]);
        sessionTokenRef.current = null;
        onPlaceSelect({ address, label, location: coords });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 180)}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleSelect(s);
                }}
                className="w-full text-left px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-start gap-2 transition-colors"
              >
                <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{s.placePrediction?.text.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface FoodcartMarkerProps {
  cart: Foodcart;
  isSelected: boolean;
  isFavorite: boolean;
  customerLocation?: LatLngLiteral;
  nowMs: number;
  onSelect: (cart: Foodcart) => void;
}

export const FoodcartMapMarker: React.FC<FoodcartMarkerProps> = ({
  cart,
  isSelected,
  isFavorite,
  customerLocation,
  nowMs,
  onSelect,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const countdown = formatCountdown(cart.timerExpiresAtMs, nowMs);
  const isActivelyOpen = cart.isLive && !countdown.isExpired;
  const distanceMeters = customerLocation
    ? getDistanceMeters(customerLocation, { lat: cart.currentLat, lng: cart.currentLng })
    : null;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: cart.currentLat, lng: cart.currentLng }}
        zIndex={isSelected ? 1000 : isActivelyOpen ? 100 : 10}
        onClick={() => onSelect(cart)}
        title={cart.name}
      >
        <div
          className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium shadow-sm transition-transform cursor-pointer ${
            isSelected
              ? 'bg-slate-900 text-white border-slate-900 scale-105'
              : isActivelyOpen
                ? 'bg-white text-slate-900 border-orange-500 hover:scale-105'
                : 'bg-slate-100 text-slate-600 border-slate-300'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isActivelyOpen ? 'bg-orange-500' : 'bg-slate-400'
            }`}
          />
          <span className="max-w-[120px] truncate font-display font-semibold">{cart.name}</span>
          {isFavorite && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}
          {isActivelyOpen && cart.timerExpiresAtMs > 0 && (
            <span
              className={`font-mono text-[11px] pl-1 border-l ${
                isSelected ? 'border-slate-700 text-orange-300' : 'border-slate-200 text-orange-600'
              }`}
            >
              {countdown.label.split(' ')[0]}
            </span>
          )}
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} pixelOffset={[0, -6]} onCloseClick={() => onSelect(cart)}>
          <div className="min-w-[210px] max-w-[260px] p-0.5 text-slate-900">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-display font-semibold text-sm text-slate-900">{cart.name}</h4>
                <p className="text-xs text-slate-500">
                  {getCartNationality(cart)
                    ? `${getCartNationality(cart)} · ${cart.cuisine}`
                    : cart.cuisine}
                  {distanceMeters !== null && ` · ${formatDistance(distanceMeters)}`}
                </p>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{cart.currentPlaceName || 'Pinned Location'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                <span className="font-mono font-medium text-slate-800">
                  {cart.isLive ? countdown.label : 'Scheduled / Offline'}
                </span>
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface RouteScheduleOverlayProps {
  stops: RouteStop[];
}

export const RouteScheduleOverlay: React.FC<RouteScheduleOverlayProps> = ({ stops }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const [fallbackPath, setFallbackPath] = useState<LatLngLiteral[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map || stops.length < 2) {
      setFallbackPath([]);
      return;
    }

    const straight = stops.map((s) => ({ lat: s.lat, lng: s.lng }));

    if (!routesLib) {
      setFallbackPath(straight);
      return;
    }

    let cancelled = false;
    const pairs: Array<{ origin: LatLngLiteral; destination: LatLngLiteral }> = [];
    for (let i = 0; i < stops.length - 1; i++) {
      pairs.push({
        origin: { lat: stops[i].lat, lng: stops[i].lng },
        destination: { lat: stops[i + 1].lat, lng: stops[i + 1].lng },
      });
    }

    Promise.all(
      pairs.map((pair) =>
        (routesLib.Route as unknown as {
          computeRoutes: (req: unknown) => Promise<{ routes?: Array<{ createPolylines: () => google.maps.Polyline[] }> }>;
        }).computeRoutes({
          origin: pair.origin,
          destination: pair.destination,
          travelMode: 'DRIVING',
          fields: ['path'],
        })
      )
    )
      .then((results) => {
        if (cancelled) return;
        const created: google.maps.Polyline[] = [];
        let hasRenderedRoad = false;
        results.forEach((res) => {
          const route = res.routes?.[0];
          if (route && typeof route.createPolylines === 'function') {
            const lines = route.createPolylines();
            lines.forEach((line) => {
              line.setOptions({
                strokeColor: '#ea580c',
                strokeWeight: 4,
                strokeOpacity: 0.85,
              });
              line.setMap(map);
              created.push(line);
            });
            hasRenderedRoad = true;
          }
        });
        polylinesRef.current = created;
        setFallbackPath(hasRenderedRoad ? [] : straight);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setFallbackPath(straight);
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, stops]);

  return (
    <>
      {fallbackPath.length >= 2 && (
        <Polyline
          path={fallbackPath}
          strokeColor="#ea580c"
          strokeOpacity={0.85}
          strokeWeight={4}
        />
      )}
      {stops.map((stop, idx) => (
        <AdvancedMarker
          key={stop.id}
          position={{ lat: stop.lat, lng: stop.lng }}
          zIndex={50 + idx}
          title={`${idx + 1}. ${stop.label}`}
        >
          <div className="flex items-center gap-1.5 bg-slate-900 text-white px-2 py-1 rounded-md border border-white/20 shadow text-[11px] font-medium">
            <span className="font-mono text-orange-400 font-semibold">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <span className="max-w-[110px] truncate">{stop.label}</span>
          </div>
        </AdvancedMarker>
      ))}
    </>
  );
};

interface InteractiveDistrictMapProps {
  center: LatLngLiteral;
  zoom?: number;
  customerLocation?: LatLngLiteral;
  radiusMeters?: number;
  carts?: Foodcart[];
  selectedCartId?: string | null;
  favoriteIds?: string[];
  routeStops?: RouteStop[];
  ownerPinLocation?: LatLngLiteral;
  geolocatorAccuracyMeters?: number | null;
  geolocatorHeadingDeg?: number | null;
  geolocatorTrail?: LatLngLiteral[];
  isGeolocatorStreaming?: boolean;
  remoteTelemetryCenter?: LatLngLiteral | null;
  remoteTelemetryAccuracyMeters?: number | null;
  remoteTelemetryTrail?: LatLngLiteral[];
  locationRequests?: CartLocationRequest[];
  autoPan?: boolean;
  nowMs?: number;
  onSelectCart?: (cart: Foodcart) => void;
  onMapClick?: (coords: LatLngLiteral) => void;
  onCenterChange?: (center: LatLngLiteral) => void;
}

export const InteractiveDistrictMap: React.FC<InteractiveDistrictMapProps> = ({
  center,
  zoom = 13,
  customerLocation,
  radiusMeters,
  carts = [],
  selectedCartId = null,
  favoriteIds = [],
  routeStops = [],
  ownerPinLocation,
  geolocatorAccuracyMeters = null,
  geolocatorHeadingDeg = null,
  geolocatorTrail = [],
  isGeolocatorStreaming = false,
  remoteTelemetryCenter = null,
  remoteTelemetryAccuracyMeters = null,
  remoteTelemetryTrail = [],
  locationRequests = [],
  autoPan = true,
  nowMs = Date.now(),
  onSelectCart,
  onMapClick,
}) => {
  const isLoaded = useApiIsLoaded();
  const status = useApiLoadingStatus();
  const map = useMap();

  useEffect(() => {
    if (map && center && autoPan) {
      map.panTo(center);
    }
  }, [map, center, autoPan]);

  const handleMapClick = useCallback(
    (ev: { detail: { latLng: google.maps.LatLngLiteral | null } }) => {
      if (onMapClick && ev.detail.latLng) {
        onMapClick({ lat: ev.detail.latLng.lat, lng: ev.detail.latLng.lng });
      }
    },
    [onMapClick]
  );

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="w-full h-full min-h-[420px] bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center justify-center p-6 text-center">
        <MapPin className="w-8 h-8 text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-800">Unable to load Google Maps view</p>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Verify your Google Maps Platform API key configuration or check network connectivity.
        </p>
      </div>
    );
  }

  const activeGpsAnchor = ownerPinLocation || customerLocation || null;
  const headingStyle =
    geolocatorHeadingDeg !== null && geolocatorHeadingDeg >= 0
      ? { transform: `rotate(${Math.round(geolocatorHeadingDeg)}deg)` }
      : undefined;

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80 text-xs font-medium text-slate-600">
          Loading district map...
        </div>
      )}
      <GoogleMap
        defaultCenter={center}
        defaultZoom={zoom}
        mapId={DEMO_MAP_ID}
        gestureHandling="greedy"
        disableDefaultUI={false}
        streetViewControl={false}
        mapTypeControl={false}
        internalUsageAttributionIds={MAPS_ATTRIBUTION_IDS}
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Local Live GPS Breadcrumb Trail */}
        {geolocatorTrail.length >= 2 && (
          <Polyline
            path={geolocatorTrail}
            strokeColor="#0284c7"
            strokeOpacity={0.85}
            strokeWeight={3}
          />
        )}

        {/* Remote Cart Telemetry Trail */}
        {remoteTelemetryTrail.length >= 2 && (
          <Polyline
            path={remoteTelemetryTrail}
            strokeColor="#059669"
            strokeOpacity={0.85}
            strokeWeight={3}
          />
        )}

        {/* Local Live GPS Accuracy Circle */}
        {activeGpsAnchor && geolocatorAccuracyMeters && geolocatorAccuracyMeters > 0 && (
          <Circle
            center={activeGpsAnchor}
            radius={geolocatorAccuracyMeters}
            strokeColor="#0284c7"
            strokeOpacity={0.75}
            strokeWeight={1.5}
            fillColor="#0284c7"
            fillOpacity={0.1}
            clickable={false}
          />
        )}

        {/* Remote Cart Telemetry Accuracy Circle */}
        {remoteTelemetryCenter &&
          remoteTelemetryAccuracyMeters &&
          remoteTelemetryAccuracyMeters > 0 && (
            <Circle
              center={remoteTelemetryCenter}
              radius={remoteTelemetryAccuracyMeters}
              strokeColor="#059669"
              strokeOpacity={0.7}
              strokeWeight={1.5}
              fillColor="#059669"
              fillOpacity={0.09}
              clickable={false}
            />
          )}

        {customerLocation && (
          <AdvancedMarker position={customerLocation} zIndex={220} title="Your Location">
            <div
              className={`flex items-center justify-center w-9 h-9 rounded-full border-2 border-white shadow-md text-white transition-colors ${
                isGeolocatorStreaming ? 'bg-sky-600' : 'bg-slate-900'
              }`}
            >
              <Navigation className="w-4 h-4 fill-current" style={headingStyle} />
            </div>
          </AdvancedMarker>
        )}

        {customerLocation && radiusMeters && radiusMeters > 0 && (
          <Circle
            center={customerLocation}
            radius={radiusMeters}
            strokeColor="#ea580c"
            strokeOpacity={0.65}
            strokeWeight={1.5}
            fillColor="#ea580c"
            fillOpacity={0.08}
            clickable={false}
          />
        )}

        {ownerPinLocation && (
          <AdvancedMarker position={ownerPinLocation} zIndex={500} title="Cart Stop Pin">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 border-white shadow-md text-xs font-semibold text-white ${
                isGeolocatorStreaming ? 'bg-sky-600' : 'bg-orange-600'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 fill-current" style={headingStyle} />
              <span>{isGeolocatorStreaming ? 'Live GPS' : 'Pinned Stop'}</span>
            </div>
          </AdvancedMarker>
        )}

        {carts.map((cart) => (
          <FoodcartMapMarker
            key={cart.id}
            cart={cart}
            isSelected={cart.id === selectedCartId}
            isFavorite={favoriteIds.includes(cart.id)}
            customerLocation={customerLocation}
            nowMs={nowMs}
            onSelect={(c) => onSelectCart?.(c)}
          />
        ))}

        {locationRequests.map((req) => (
          <AdvancedMarker
            key={req.id}
            position={{ lat: req.lat, lng: req.lng }}
            zIndex={req.status === 'pending' ? 350 : 260}
            title={`Request from ${req.customerName}: ${req.locationLabel}`}
          >
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold shadow-sm ${
                req.status === 'approved'
                  ? 'bg-emerald-700 text-white border-white'
                  : 'bg-amber-500 text-slate-950 border-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="max-w-[120px] truncate">{req.locationLabel}</span>
              <span className="font-mono text-[11px] tabular-nums">({req.partySize})</span>
            </div>
          </AdvancedMarker>
        ))}

        {routeStops.length > 0 && <RouteScheduleOverlay stops={routeStops} />}
      </GoogleMap>
    </div>
  );
};
