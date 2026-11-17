import React, { useState } from 'react';
import {
  Check,
  Compass,
  Copy,
  Crosshair,
  Gauge,
  LocateFixed,
  MapPin,
  Radio,
  RotateCcw,
  Square,
} from 'lucide-react';
import { RealtimeGeolocatorState } from '../hooks/useRealtimeGeolocator';
import {
  formatAccuracy,
  formatHeading,
  formatSpeed,
} from '../utils/geo';

interface RealtimeGeolocatorPanelProps {
  geolocator: RealtimeGeolocatorState;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  firestoreSyncActive?: boolean;
  lastFirestoreSyncMs?: number | null;
  autoCenter?: boolean;
  onToggleAutoCenter?: (next: boolean) => void;
}

export const RealtimeGeolocatorPanel: React.FC<RealtimeGeolocatorPanelProps> = ({
  geolocator,
  title = 'Real-Time Geolocator',
  subtitle = 'Continuous GPS telemetry, heading, and accuracy circle',
  compact = false,
  firestoreSyncActive = false,
  lastFirestoreSyncMs = null,
  autoCenter,
  onToggleAutoCenter,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCoords = async () => {
    const text = `${geolocator.coords.lat.toFixed(6)}, ${geolocator.coords.lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback not needed in non-secure contexts
    }
  };

  const statusText =
    geolocator.status === 'tracking'
      ? 'Live GPS Active'
      : geolocator.status === 'acquiring'
        ? 'Acquiring GPS Fix...'
        : geolocator.status === 'error'
          ? 'GPS Signal Alert'
          : 'Standby';

  const statusTone =
    geolocator.status === 'tracking'
      ? 'bg-sky-50 border-sky-200 text-sky-900'
      : geolocator.status === 'acquiring'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : geolocator.status === 'error'
          ? 'bg-red-50 border-red-200 text-red-900'
          : 'bg-slate-100 border-slate-200 text-slate-700';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-4 h-4 shrink-0 ${
                geolocator.isWatching ? 'text-sky-600' : 'text-orange-600'
              }`}
            />
            <h3 className="font-display font-semibold text-sm text-slate-900 truncate">
              {title}
            </h3>
          </div>
          {!compact && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        <span
          className={`px-2 py-1 text-[11px] font-medium border rounded-md whitespace-nowrap shrink-0 ${statusTone}`}
        >
          {statusText}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {geolocator.isWatching ? (
          <button
            type="button"
            onClick={geolocator.stopWatching}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop Live Stream</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={geolocator.startWatching}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Start Live GPS Stream</span>
          </button>
        )}

        <button
          type="button"
          onClick={geolocator.locateOnce}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Single Fix</span>
        </button>

        {geolocator.trail.length > 0 && (
          <button
            type="button"
            onClick={geolocator.clearTrail}
            aria-label="Clear GPS trail"
            title="Clear breadcrumb trail"
            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {geolocator.error && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {geolocator.error}
        </div>
      )}

      {/* Monospace Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="text-[11px] text-slate-500">Coordinates</div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 tabular-nums truncate">
            {geolocator.coords.lat.toFixed(5)}, {geolocator.coords.lng.toFixed(5)}
          </div>
        </div>

        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <LocateFixed className="w-3 h-3 text-sky-600" />
            <span>Accuracy</span>
          </div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 tabular-nums">
            {formatAccuracy(geolocator.accuracyMeters)}
          </div>
        </div>

        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Gauge className="w-3 h-3 text-orange-600" />
            <span>Speed</span>
          </div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 tabular-nums">
            {formatSpeed(geolocator.speedMps)}
          </div>
        </div>

        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Compass className="w-3 h-3 text-slate-600" />
            <span>Heading</span>
          </div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 tabular-nums">
            {formatHeading(geolocator.headingDeg)}
          </div>
        </div>
      </div>

      {/* Resolved Location & Session Footer */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 text-slate-700">
          <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
          <span className="truncate">{geolocator.resolvedAddress}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void geolocator.reverseGeocode()}
            disabled={geolocator.geocoding}
            className="text-xs font-medium text-sky-700 hover:underline disabled:opacity-50 whitespace-nowrap"
          >
            {geolocator.geocoding ? 'Resolving...' : 'Resolve Street'}
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={() => void handleCopyCoords()}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {(firestoreSyncActive || (typeof autoCenter === 'boolean' && onToggleAutoCenter)) && (
        <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-slate-500">
          {firestoreSyncActive && (
            <span className="text-emerald-700 font-medium">
              Cloud Sync On
              {lastFirestoreSyncMs
                ? ` (${new Date(lastFirestoreSyncMs).toLocaleTimeString([], {
                    minute: '2-digit',
                    second: '2-digit',
                  })})`
                : ''}
            </span>
          )}
          {typeof autoCenter === 'boolean' && onToggleAutoCenter && (
            <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoCenter}
                onChange={(e) => onToggleAutoCenter(e.target.checked)}
                className="accent-sky-600"
              />
              <span>Auto-Follow Map</span>
            </label>
          )}
        </div>
      )}
    </div>
  );
};
