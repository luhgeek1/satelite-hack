'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { Plus, Minus, RotateCcw, Sun, Moon } from 'lucide-react';
import { ComposableMap, Geographies, Geography, Marker, Line, ZoomableGroup, Graticule } from 'react-simple-maps';
import { geoCircle, geoEquirectangular } from 'd3-geo';
import countries110m from 'world-atlas/countries-110m.json';
import type { LinkView, SatelliteView } from '@/entities/satellite';
import type { GroundSiteView } from '@/entities/ground-site';
import { routeEdgeIndex, edgeKey, type RouteTrace } from '@/entities/simulation';
import { cn, criticalityLevel, isFiniteNumber, isRecord, readStored, writeStored } from '@/shared/lib';
import { useI18n } from '@/shared/i18n';
import { FALLBACK_CONTACT_RADIUS_KM } from '@/shared/config';
import {
  useFailurePings,
  FAILURE_RING_COUNT,
  FAILURE_RING_FLIGHT_MS,
  FAILURE_RING_INTERVAL_MS
} from '../model/use-failure-pings';

const EARTH_RADIUS_KM_EXPORT = 6371;

/** Where the map was left, so a reload does not throw the view away. */
const MAP_VIEW_KEY = 'orbitguard-map-view-v1';
type MapView = { coordinates: [number, number]; zoom: number };
const DEFAULT_MAP_VIEW: MapView = { coordinates: [0, 0], zoom: 1 };

const isMapView = (value: unknown): value is MapView =>
  isRecord(value)
  && Array.isArray(value.coordinates)
  && value.coordinates.length === 2
  && value.coordinates.every(isFiniteNumber)
  && isFiniteNumber(value.zoom)
  && value.zoom >= 1
  && value.zoom <= 8;

interface Map2DProps {
  satellites: SatelliteView[];
  links: LinkView[];
  groundStations: GroundSiteView[];
  gateways: GroundSiteView[];
  routes?: RouteTrace[];
  onSiteClick?: (siteId: string) => void;
  focusClientId?: string | null;
  onSatelliteClick?: (sat: SatelliteView) => void;
  selectedSatellite?: string | null;
  mode?: 'simulation' | 'resilience';
  /** Ground-contact radius derived from the scenario's elevation mask. */
  contactRadiusKm?: number;
}

/** Bundled rather than fetched, so the map also draws with no network. */
const geography = countries110m as any;

const ALARM = '#e4483a';

/**
 * Two grounds for the same chart. The dark one belongs to the console around
 * it; the bright one is for actually reading coastlines and where a terminal
 * sits, which the near-black basemap made hard. Land is lighter than water in
 * the bright palette, the way a paper chart prints it.
 */
interface MapPalette {
  surface: string;
  land: string;
  rule: string;
  graticule: string;
  label: string;
  site: string;
  selection: string;
  routeHalo: string;
  coverageFill: number;
  coverageStroke: number;
}

const DARK_MAP: MapPalette = {
  surface: '#000000',
  land: '#131316',
  rule: '#2e2e34',
  graticule: 'rgba(255,255,255,0.05)',
  label: '#a1a1aa',
  site: '#a1a1aa',
  selection: '#fafafa',
  routeHalo: '#d4d4d8',
  coverageFill: 0.1,
  coverageStroke: 0.45
};

const BRIGHT_MAP: MapPalette = {
  surface: '#cdd8e1',
  land: '#f2f4f6',
  rule: '#7b8794',
  graticule: 'rgba(15,23,42,0.10)',
  label: '#3f3f46',
  site: '#3f3f46',
  selection: '#18181b',
  routeHalo: '#3f3f46',
  coverageFill: 0.18,
  coverageStroke: 0.7
};

const MAP_BRIGHT_KEY = 'orbitguard-map-bright-v1';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** Matches the globe's coverage reveal, so the two views feel like one tool. */
const COVERAGE_TWEEN_MS = 220;

/**
 * Map units per degree of arc, read off the projection itself rather than
 * assumed: ComposableMap builds an unscaled geoEquirectangular, and everything
 * drawn in map units has to agree with it.
 */
const MAP_UNITS_PER_DEGREE = geoEquirectangular().scale() * (Math.PI / 180);

/**
 * Equirectangular view of the same constellation the globe shows: ground track
 * instead of a sphere, which is how coverage over a service area is actually
 * read. Colour follows the globe exactly — plane identity and nothing else,
 * with the one alarm hue reserved for failed nodes.
 */
export const Map2D: React.FC<Map2DProps> = ({
  satellites,
  links,
  groundStations,
  gateways,
  routes = [],
  onSiteClick,
  focusClientId = null,
  onSatelliteClick,
  selectedSatellite,
  mode = 'simulation',
  contactRadiusKm = FALLBACK_CONTACT_RADIUS_KM
}) => {
  const { t } = useI18n();
  const failurePings = useFailurePings(satellites);
  const coverageDegrees = (contactRadiusKm / EARTH_RADIUS_KM_EXPORT) * (180 / Math.PI);
  // A failure wave stops at the node's own footprint, same as on the globe.
  const failureRingUnits = coverageDegrees * MAP_UNITS_PER_DEGREE;
  // Equirectangular stretches longitude towards the poles, so a circular
  // footprint projects as an oval. The clamp keeps a near-polar node's wave
  // from running off across the whole map.
  const failureRingWidth = (lat: number) =>
    failureRingUnits / Math.max(0.28, Math.cos(lat * (Math.PI / 180)));
  const [tooltip, setTooltip] = useState<{ content: React.ReactNode; x: number; y: number } | null>(null);
  // Read straight in the initialiser: this component is client-only, so there
  // is no server markup for a restored view to disagree with.
  const [position, setPosition] = useState<MapView>(
    () => readStored(MAP_VIEW_KEY, isMapView) ?? DEFAULT_MAP_VIEW
  );
  const [bright, setBright] = useState(() => readStored(MAP_BRIGHT_KEY, isBoolean) ?? false);
  const palette = bright ? BRIGHT_MAP : DARK_MAP;

  useEffect(() => {
    writeStored(MAP_BRIGHT_KEY, bright);
  }, [bright]);

  useEffect(() => {
    writeStored(MAP_VIEW_KEY, position);
  }, [position]);

  // Tweened so the footprint grows out of the satellite rather than popping in.
  const [coverage, setCoverage] = useState<{ id: string | null; scale: number }>({
    id: selectedSatellite ?? null,
    scale: selectedSatellite ? 1 : 0
  });
  const coverageScaleRef = useRef(coverage.scale);
  coverageScaleRef.current = coverage.scale;

  useEffect(() => {
    const target = selectedSatellite ? 1 : 0;
    const id = selectedSatellite ?? coverage.id;
    // Same restart the globe needs: switching straight from one node to another
    // leaves the scale at 1, and the new footprint would appear fully grown.
    const restarting = Boolean(selectedSatellite) && coverage.id !== selectedSatellite;
    const from = restarting ? 0 : coverageScaleRef.current;
    if (from === target && !restarting) return;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - start) / COVERAGE_TWEEN_MS));
      const eased = progress * (2 - progress);
      setCoverage({ id, scale: from + (target - from) * eased });
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSatellite]);

  const coverageSat = coverage.scale > 0.001 ? satellites.find(s => s.id === coverage.id) : undefined;
  const coverageShape = coverageSat
    ? {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: {},
            geometry: geoCircle()
              .center([coverageSat.lon, coverageSat.lat])
              .radius(coverageDegrees * coverage.scale)()
          }
        ]
      }
    : null;

  const handleZoomIn = () => setPosition(pos => (pos.zoom >= 8 ? pos : { ...pos, zoom: pos.zoom * 1.5 }));
  const handleZoomOut = () => setPosition(pos => (pos.zoom <= 1 ? pos : { ...pos, zoom: pos.zoom / 1.5 }));
  const handleReset = () => setPosition({ coordinates: [0, 0], zoom: 1 });

  const handleMoveEnd = (pos: { coordinates: [number, number]; zoom: number }) => {
    setPosition({ coordinates: pos.coordinates, zoom: pos.zoom });
  };

  // Markers live inside the zoom transform, so everything drawn in map units
  // has to be divided by the zoom to hold a constant size on screen. Without
  // this a satellite becomes a blob at 4x and the route line a ribbon.
  const k = 1 / position.zoom;

  const satelliteColor = (sat: SatelliteView) => {
    if (sat.failed) return ALARM;
    if (mode === 'resilience') return criticalityLevel(sat.criticality).color;
    return sat.color;
  };

  const routeEdges = useMemo(() => routeEdgeIndex(routes), [routes]);

  const routeNodes = useMemo(() => {
    const carried = new Map<string, string>();
    for (const trace of routes) {
      if (!trace.available) continue;
      for (const node of trace.path) {
        if (trace.focused || !carried.has(node)) carried.set(node, trace.color);
      }
    }
    return carried;
  }, [routes]);

  const renderLink = (
    source: { lat: number; lon: number },
    target: { lat: number; lon: number },
    route: { color: string; focused: boolean } | undefined,
    key: string,
  ) => {
    const stroke = route ? route.color : palette.rule;
    const strokeWidth = (route ? (route.focused ? 1.4 : 1) : 0.5) * k;
    const strokeOpacity = route ? (route.focused ? 1 : 0.7) : 0.55;
    const diffLon = target.lon - source.lon;

    // A link that crosses the antimeridian has to be drawn as two runs, or it
    // sweeps back across the whole map.
    if (Math.abs(diffLon) > 180) {
      const sign = Math.sign(source.lon);
      const latMid = (source.lat + target.lat) / 2;
      return (
        <g key={key}>
          <Line from={[source.lon, source.lat]} to={[sign * 180, latMid]} stroke={stroke} strokeWidth={strokeWidth} strokeOpacity={strokeOpacity} />
          <Line from={[-sign * 180, latMid]} to={[target.lon, target.lat]} stroke={stroke} strokeWidth={strokeWidth} strokeOpacity={strokeOpacity} />
        </g>
      );
    }

    return (
      <Line
        key={key}
        from={[source.lon, source.lat]}
        to={[target.lon, target.lat]}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
      />
    );
  };

  const siteLabel = (id: string) => (
    <text
      x={6 * k}
      y={2.5 * k}
      fontSize={5 * k}
      fill={palette.label}
      fontFamily="'IBM Plex Mono', monospace"
      style={{ pointerEvents: 'none' }}
    >
      {id}
    </text>
  );

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: palette.surface }}
      // Functional update on purpose. Leaving a marker fires mouseleave and
      // mousemove inside the same gesture; reading `tooltip` from the closure
      // here would see the pre-clear value and resurrect the tooltip, which
      // then trails the cursor forever.
      onMouseMove={event => {
        const { clientX, clientY } = event;
        setTooltip(current => (current ? { ...current, x: clientX, y: clientY } : current));
      }}
      onMouseLeave={() => setTooltip(null)}
      onPointerDown={() => setTooltip(null)}
    >
      <ComposableMap
        projection="geoEquirectangular"
        style={{ width: '100%', height: '100%', background: palette.surface, outline: 'none' }}
      >
        <ZoomableGroup
          center={position.coordinates}
          zoom={position.zoom}
          onMoveEnd={(props) => handleMoveEnd({ coordinates: props.coordinates ?? [0, 0], zoom: props.zoom ?? 1 })}
          minZoom={1}
          maxZoom={8}
        >
          <Graticule stroke={palette.graticule} strokeWidth={0.4 * k} />

          <Geographies geography={geography}>
            {({ geographies }: { geographies: any[] }) =>
              geographies.map(geo => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={palette.land}
                  stroke={palette.rule}
                  strokeWidth={0.4 * k}
                  tabIndex={-1}
                  /* Land is a backdrop. Leaving it focusable meant a stray click
                     put a focus ring around a whole country. */
                  style={{
                    default: { outline: 'none', pointerEvents: 'none' },
                    hover: { outline: 'none', pointerEvents: 'none' },
                    pressed: { outline: 'none', pointerEvents: 'none' }
                  } as any}
                />
              ))
            }
          </Geographies>

          {coverageShape && coverageSat && (
            <Geographies geography={coverageShape}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo, index) => (
                  <Geography
                    key={`coverage-${index}`}
                    geography={geo}
                    tabIndex={-1}
                    fill={satelliteColor(coverageSat)}
                    fillOpacity={palette.coverageFill}
                    stroke={satelliteColor(coverageSat)}
                    strokeOpacity={palette.coverageStroke}
                    strokeWidth={0.6 * k}
                    style={{
                      default: { outline: 'none', pointerEvents: 'none' },
                      hover: { outline: 'none', pointerEvents: 'none' },
                      pressed: { outline: 'none', pointerEvents: 'none' }
                    } as any}
                  />
                ))
              }
            </Geographies>
          )}

          {links.map((link, index) => {
            const find = (id: string) =>
              satellites.find(s => s.id === id) || groundStations.find(g => g.id === id) || gateways.find(g => g.id === id);
            const source = find(link.source);
            const target = find(link.target);
            if (!source || !target) return null;

            const route = routeEdges.get(edgeKey(link.source, link.target));
            const isRoute = Boolean(route);

            const touchesFailedNode =
              Boolean((source as SatelliteView).failed) || Boolean((target as SatelliteView).failed);
            if (touchesFailedNode && isRoute) return null;

            return renderLink(source, target, route, `link-${index}`);
          })}

          {gateways.map(gateway => (
            <Marker key={gateway.id} coordinates={[gateway.lon, gateway.lat]}>
              <polygon points={`0,${-4 * k} ${4 * k},0 0,${4 * k} ${-4 * k},0`} fill={palette.site} />
              {siteLabel(gateway.id)}
            </Marker>
          ))}

          {groundStations.map(station => {
            const trace = routes.find(item => item.clientId === station.id);
            const tint = trace ? (trace.available ? trace.color : ALARM) : palette.site;
            // A site with no route reads as a warning sign rather than as a
            // marker that happens to be red: the glyph says what the colour
            // means, which the colour alone never does.
            const stranded = Boolean(trace && !trace.available);
            const size = stranded ? 5.2 : 4;

            return (
              <Marker
                key={station.id}
                coordinates={[station.lon, station.lat]}
                onClick={onSiteClick ? () => onSiteClick(station.id) : undefined}
                style={onSiteClick ? { cursor: 'pointer' } : undefined}
              >
                <polygon
                  points={`0,${-size * k} ${size * k},${size * 0.78 * k} ${-size * k},${size * 0.78 * k}`}
                  fill={station.id === focusClientId || stranded ? `${tint}33` : 'transparent'}
                  stroke={tint}
                  strokeWidth={(station.id === focusClientId || stranded ? 1.6 : 1) * k}
                />
                {stranded && (
                  <g style={{ pointerEvents: 'none' }}>
                    <title>{t('map.offline', { site: station.id })}</title>
                    <line
                      x1={0}
                      y1={-1.4 * k}
                      x2={0}
                      y2={1.6 * k}
                      stroke={ALARM}
                      strokeWidth={1.1 * k}
                      strokeLinecap="butt"
                    />
                    <circle cx={0} cy={3 * k} r={0.62 * k} fill={ALARM} />
                  </g>
                )}
                {siteLabel(station.id)}
              </Marker>
            );
          })}

          {satellites.map(sat => {
            const isFailed = sat.failed;
            const isSelected = selectedSatellite === sat.id;
            const isActiveRoute = routeNodes.has(sat.id);
            const isPinging = failurePings.has(sat.id);

            return (
              <Marker
                key={sat.id}
                coordinates={[sat.lon, sat.lat]}
                onMouseEnter={(event: React.MouseEvent) =>
                  setTooltip({
                    content: (
                      <div className="min-w-[132px] border border-rule-strong bg-[black] p-2 font-data text-[11px] shadow-xl">
                        <div className="mb-1 flex items-center justify-between gap-3 border-b border-rule pb-1">
                          <span className="text-zinc-100">{sat.id}</span>
                          <span className={isFailed ? 'text-alarm' : 'text-zinc-500'}>
                            {isFailed ? t('config.stateFailed') : t('config.stateNominal')}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3 tabular-nums text-zinc-500">
                          <span>{t('sat.plane')}</span>
                          <span className="text-zinc-300">{sat.planeId}</span>
                        </div>
                        <div className="flex justify-between gap-3 tabular-nums text-zinc-500">
                          <span>{t('map.lat')}</span>
                          <span className="text-zinc-300">{sat.lat.toFixed(2)}&deg;</span>
                        </div>
                        <div className="flex justify-between gap-3 tabular-nums text-zinc-500">
                          <span>{t('map.lon')}</span>
                          <span className="text-zinc-300">{sat.lon.toFixed(2)}&deg;</span>
                        </div>
                      </div>
                    ),
                    x: event.clientX,
                    y: event.clientY
                  })
                }
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onSatelliteClick?.(sat)}
                onDoubleClickCapture={(event: React.MouseEvent) => event.stopPropagation()}
                style={{ cursor: onSatelliteClick ? 'pointer' : 'default', outline: 'none' } as any}
              >
                {/* Waves out to the footprint the node has just stopped
                    serving. Drawn first so they pass under the marker, and
                    scaled rather than re-pathed so the burst costs one
                    transform per frame instead of a re-render of the map. */}
                {isPinging && (
                  <g style={{ pointerEvents: 'none' }}>
                    {Array.from({ length: FAILURE_RING_COUNT }, (_, index) => (
                      <motion.ellipse
                        key={index}
                        rx={failureRingWidth(sat.lat)}
                        ry={failureRingUnits}
                        fill="transparent"
                        stroke={ALARM}
                        strokeWidth={1.4}
                        vectorEffect="non-scaling-stroke"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: [0, 0.95, 0.6, 0] }}
                        transition={{
                          duration: FAILURE_RING_FLIGHT_MS / 1000,
                          delay: (index * FAILURE_RING_INTERVAL_MS) / 1000,
                          ease: 'easeOut',
                          opacity: {
                            duration: FAILURE_RING_FLIGHT_MS / 1000,
                            delay: (index * FAILURE_RING_INTERVAL_MS) / 1000,
                            // Held bright over the first half, the way the
                            // globe's waves are, so the two views read alike.
                            times: [0, 0.07, 0.55, 1],
                            ease: 'linear'
                          }
                        }}
                      />
                    ))}
                  </g>
                )}

                {/* The dot is 1.5px across; this is what the pointer actually hits. */}
                <circle r={9 * k} fill="transparent" style={{ cursor: 'pointer' }} />

                {isFailed ? (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle r={4 * k} fill="transparent" stroke={ALARM} strokeWidth={1.2 * k} />
                    <line x1={-2.6 * k} y1={-2.6 * k} x2={2.6 * k} y2={2.6 * k} stroke={ALARM} strokeWidth={1.2 * k} />
                    <line x1={-2.6 * k} y1={2.6 * k} x2={2.6 * k} y2={-2.6 * k} stroke={ALARM} strokeWidth={1.2 * k} />
                  </g>
                ) : (
                  <circle
                    r={(isSelected || isActiveRoute ? 3.4 : 2.3) * k}
                    fill={satelliteColor(sat)}
                    opacity={0.9}
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {isSelected && (
                  <motion.circle
                    r={7 * k}
                    fill="transparent"
                    stroke={palette.selection}
                    strokeWidth={1.2 * k}
                    strokeDasharray={`${1.5 * k},${1.5 * k}`}
                    style={{ pointerEvents: 'none' }}
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                  />
                )}

                {isActiveRoute && !isSelected && (
                  <circle
                    r={5.5 * k}
                    fill="transparent"
                    stroke={palette.routeHalo}
                    strokeWidth={0.5 * k}
                    opacity={0.6}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full pb-3"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}

      {/* The chrome follows the chart it sits on, or a dark block would float
          over the bright map. */}
      <div
        className={cn(
          'absolute bottom-16 right-3 z-20 flex flex-col border backdrop-blur lg:bottom-[4.5rem] lg:right-6',
          bright ? 'border-zinc-400 bg-white/85' : 'border-rule-strong bg-black/85',
        )}
      >
        {[
          { label: t('map.zoomIn'), icon: <Plus size={14} />, onClick: handleZoomIn },
          { label: t('map.zoomOut'), icon: <Minus size={14} />, onClick: handleZoomOut },
          { label: t('map.reset'), icon: <RotateCcw size={13} />, onClick: handleReset },
          {
            label: bright ? t('map.dark') : t('map.bright'),
            icon: bright ? <Moon size={13} /> : <Sun size={13} />,
            onClick: () => setBright(value => !value),
          },
        ].map(control => (
          <button
            key={control.label}
            type="button"
            onClick={control.onClick}
            title={control.label}
            aria-label={control.label}
            className={cn(
              'flex h-7 w-7 items-center justify-center border-t transition-colors first:border-t-0 focus-visible:outline-none',
              bright
                ? 'border-zinc-400 text-zinc-500 hover:bg-black/[0.06] hover:text-zinc-900 focus-visible:bg-black/15 focus-visible:text-zinc-900'
                : 'border-rule-strong text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:bg-white/15 focus-visible:text-zinc-100',
            )}
          >
            {control.icon}
          </button>
        ))}
      </div>
    </div>
  );
};
