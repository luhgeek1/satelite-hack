import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Plus, Minus, RotateCcw } from 'lucide-react';
import { ComposableMap, Geographies, Geography, Marker, Line, ZoomableGroup, Graticule } from 'react-simple-maps';
import { geoCircle, geoEquirectangular } from 'd3-geo';
import countries110m from 'world-atlas/countries-110m.json';
import { Satellite, GroundStation, Link } from '../types';
import { planeColors, COVERAGE_DEGREES } from './Globe';
import { criticalityLevel } from '../lib/criticality';
import {
  useFailurePings,
  FAILURE_RING_COUNT,
  FAILURE_RING_FLIGHT_MS,
  FAILURE_RING_INTERVAL_MS
} from '../hooks/useFailurePings';

interface Map2DProps {
  satellites: Satellite[];
  links: Link[];
  groundStations: GroundStation[];
  gateways: GroundStation[];
  activeRoute?: string[];
  onSatelliteClick?: (sat: Satellite) => void;
  selectedSatellite?: string | null;
  mode?: 'simulation' | 'resilience';
}

/** Bundled rather than fetched, so the map also draws with no network. */
const geography = countries110m as any;

const ALARM = '#e4483a';
const RULE = '#2e2e34';
const LAND_FILL = '#131316';

/** Matches the globe's coverage reveal, so the two views feel like one tool. */
const COVERAGE_TWEEN_MS = 220;

/**
 * Map units per degree of arc, read off the projection itself rather than
 * assumed: ComposableMap builds an unscaled geoEquirectangular, and everything
 * drawn in map units has to agree with it.
 */
const MAP_UNITS_PER_DEGREE = geoEquirectangular().scale() * (Math.PI / 180);
/** A failure wave stops at the node's own footprint, same as on the globe. */
const FAILURE_RING_UNITS = COVERAGE_DEGREES * MAP_UNITS_PER_DEGREE;
/**
 * Equirectangular stretches longitude towards the poles, so a circular
 * footprint projects as an oval. The clamp keeps a near-polar node's wave from
 * running off across the whole map.
 */
const failureRingWidth = (lat: number) =>
  FAILURE_RING_UNITS / Math.max(0.28, Math.cos(lat * (Math.PI / 180)));

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
  activeRoute = [],
  onSatelliteClick,
  selectedSatellite,
  mode = 'simulation'
}) => {
  const failurePings = useFailurePings(satellites);
  const [tooltip, setTooltip] = useState<{ content: React.ReactNode; x: number; y: number } | null>(null);
  const [position, setPosition] = useState({ coordinates: [0, 0] as [number, number], zoom: 1 });
  const centredOnRef = useRef<string | null>(null);

  // Recentre when the selection changes — not when the satellites move. Keying
  // this on the satellite array would drag the view back on every simulation
  // tick and fight the user's own panning.
  useEffect(() => {
    if (!selectedSatellite) {
      centredOnRef.current = null;
      return;
    }
    if (centredOnRef.current === selectedSatellite) return;

    const sat = satellites.find(s => s.id === selectedSatellite);
    if (!sat) return;

    centredOnRef.current = selectedSatellite;
    setPosition({ coordinates: [sat.lon, sat.lat], zoom: 4 });
  }, [selectedSatellite, satellites]);

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
              .radius(COVERAGE_DEGREES * coverage.scale)()
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

  const satelliteColor = (sat: Satellite) => {
    if (sat.status === 'failed') return ALARM;
    if (mode === 'resilience') return criticalityLevel(sat.criticality).color;
    return planeColors[sat.plane];
  };

  const renderLink = (source: { lat: number; lon: number }, target: { lat: number; lon: number }, isRoute: boolean, key: string) => {
    const stroke = isRoute ? '#d4d4d8' : RULE;
    const strokeWidth = (isRoute ? 1.2 : 0.5) * k;
    const strokeOpacity = isRoute ? 1 : 0.55;
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
      fill="#a1a1aa"
      fontFamily="'IBM Plex Mono', monospace"
      style={{ pointerEvents: 'none' }}
    >
      {id}
    </text>
  );

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[black]"
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
        style={{ width: '100%', height: '100%', background: '#000', outline: 'none' }}
      >
        <ZoomableGroup
          center={position.coordinates}
          zoom={position.zoom}
          onMoveEnd={handleMoveEnd}
          minZoom={1}
          maxZoom={8}
        >
          <Graticule stroke="rgba(255,255,255,0.05)" strokeWidth={0.4 * k} />

          <Geographies geography={geography}>
            {({ geographies }: { geographies: any[] }) =>
              geographies.map(geo => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={LAND_FILL}
                  stroke={RULE}
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

          {coverageShape && (
            <Geographies geography={coverageShape}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo, index) => (
                  <Geography
                    key={`coverage-${index}`}
                    geography={geo}
                    tabIndex={-1}
                    fill="rgba(228,228,231,0.10)"
                    stroke="rgba(228,228,231,0.45)"
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

            const sourceIndex = activeRoute.indexOf(link.source);
            const targetIndex = activeRoute.indexOf(link.target);
            const isRoute =
              sourceIndex !== -1 && targetIndex !== -1 && Math.abs(sourceIndex - targetIndex) === 1;

            const touchesFailedNode =
              (source as Satellite).status === 'failed' || (target as Satellite).status === 'failed';
            if (touchesFailedNode && isRoute) return null;

            return renderLink(source, target, isRoute, `link-${index}`);
          })}

          {gateways.map(gateway => (
            <Marker key={gateway.id} coordinates={[gateway.lon, gateway.lat]}>
              <polygon points={`0,${-4 * k} ${4 * k},0 0,${4 * k} ${-4 * k},0`} fill="#a1a1aa" />
              {siteLabel(gateway.id)}
            </Marker>
          ))}

          {groundStations.map(station => (
            <Marker key={station.id} coordinates={[station.lon, station.lat]}>
              <polygon
                points={`0,${-4 * k} ${4 * k},${3 * k} ${-4 * k},${3 * k}`}
                fill="transparent"
                stroke="#a1a1aa"
                strokeWidth={k}
              />
              {siteLabel(station.id)}
            </Marker>
          ))}

          {satellites.map(sat => {
            const isFailed = sat.status === 'failed';
            const isSelected = selectedSatellite === sat.id;
            const isActiveRoute = activeRoute.includes(sat.id);
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
                            {isFailed ? 'FAIL' : 'NOM'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3 tabular-nums text-zinc-500">
                          <span>Plane</span>
                          <span className="text-zinc-300">{sat.plane}</span>
                        </div>
                        <div className="flex justify-between gap-3 tabular-nums text-zinc-500">
                          <span>Lat</span>
                          <span className="text-zinc-300">{sat.lat.toFixed(2)}&deg;</span>
                        </div>
                        <div className="flex justify-between gap-3 tabular-nums text-zinc-500">
                          <span>Lon</span>
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
                        ry={FAILURE_RING_UNITS}
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
                    stroke="#fafafa"
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
                    stroke="#d4d4d8"
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

      <div className="absolute bottom-16 right-3 z-20 flex flex-col border border-rule-strong bg-black/85 backdrop-blur lg:bottom-[4.5rem] lg:right-6">
        {[
          { label: 'Zoom in', icon: <Plus size={14} />, onClick: handleZoomIn },
          { label: 'Zoom out', icon: <Minus size={14} />, onClick: handleZoomOut },
          { label: 'Reset view', icon: <RotateCcw size={13} />, onClick: handleReset }
        ].map(control => (
          <button
            key={control.label}
            type="button"
            onClick={control.onClick}
            title={control.label}
            aria-label={control.label}
            className="flex h-7 w-7 items-center justify-center border-t border-rule-strong text-zinc-500 transition-colors first:border-t-0 hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:bg-white/15 focus-visible:text-zinc-100 focus-visible:outline-none"
          >
            {control.icon}
          </button>
        ))}
      </div>
    </div>
  );
};
