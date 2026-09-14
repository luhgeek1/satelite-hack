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
import type { CoverageGap } from '../model/coverage-gaps';
import { useFailurePings, FAILURE_RING_COUNT, FAILURE_RING_FLIGHT_MS, FAILURE_RING_INTERVAL_MS } from '../model/use-failure-pings';
const EARTH_RADIUS_KM_EXPORT = 6371;
const MAP_VIEW_KEY = 'orbitguard-map-view-v1';
type MapView = {
    coordinates: [
        number,
        number
    ];
    zoom: number;
};
const DEFAULT_MAP_VIEW: MapView = { coordinates: [0, 0], zoom: 1 };
const isMapView = (value: unknown): value is MapView => isRecord(value)
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
    contactRadiusKm?: number;
    coverageGaps?: CoverageGap[];
}
const geography = countries110m as any;
const ALARM = '#e4483a';
const NO_COVERAGE_GAPS: CoverageGap[] = [];
const MASKED_LINK = '#fb7185';
interface MapPalette {
    surface: string;
    land: string | null;
    rule: string;
    linkIdle: string;
    graticule: string;
    label: string;
    labelHalo: string | null;
    casing: string | null;
    site: string;
    selection: string;
    routeHalo: string;
    coverageFill: number;
    coverageStroke: number;
}
const SCHEMATIC_MAP: MapPalette = {
    surface: '#000000',
    land: '#131316',
    rule: '#2e2e34',
    linkIdle: '#2e2e34',
    graticule: 'rgba(255,255,255,0.05)',
    label: '#a1a1aa',
    labelHalo: null,
    casing: null,
    site: '#a1a1aa',
    selection: '#fafafa',
    routeHalo: '#d4d4d8',
    coverageFill: 0.1,
    coverageStroke: 0.45
};
const RELIEF_MAP: MapPalette = {
    surface: '#040a12',
    land: null,
    rule: 'rgba(255,255,255,0.22)',
    linkIdle: 'rgba(255,255,255,0.5)',
    graticule: 'rgba(255,255,255,0.13)',
    label: '#ffffff',
    labelHalo: 'rgba(0,0,0,0.75)',
    casing: 'rgba(0,0,0,0.7)',
    site: '#ffffff',
    selection: '#ffffff',
    routeHalo: '#ffffff',
    coverageFill: 0.14,
    coverageStroke: 0.65
};
const MAP_RELIEF_KEY = 'orbitguard-map-relief-v1';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const COVERAGE_TWEEN_MS = 220;
const MAP_UNITS_PER_DEGREE = geoEquirectangular().scale() * (Math.PI / 180);
const WORLD_WIDTH = 360 * MAP_UNITS_PER_DEGREE;
const WORLD_HEIGHT = 180 * MAP_UNITS_PER_DEGREE;
const WORLD_LEFT = 400 - WORLD_WIDTH / 2;
const WORLD_TOP = 300 - WORLD_HEIGHT / 2;
export const Map2D: React.FC<Map2DProps> = ({ satellites, links, groundStations, gateways, routes = [], onSiteClick, focusClientId = null, onSatelliteClick, selectedSatellite, mode = 'simulation', contactRadiusKm = FALLBACK_CONTACT_RADIUS_KM, coverageGaps = NO_COVERAGE_GAPS }) => {
    const { t } = useI18n();
    const failurePings = useFailurePings(satellites);
    const coverageDegrees = (contactRadiusKm / EARTH_RADIUS_KM_EXPORT) * (180 / Math.PI);
    const failureRingUnits = coverageDegrees * MAP_UNITS_PER_DEGREE;
    const failureRingWidth = (lat: number) => failureRingUnits / Math.max(0.28, Math.cos(lat * (Math.PI / 180)));
    const [tooltip, setTooltip] = useState<{
        content: React.ReactNode;
        x: number;
        y: number;
    } | null>(null);
    const [position, setPosition] = useState<MapView>(() => readStored(MAP_VIEW_KEY, isMapView) ?? DEFAULT_MAP_VIEW);
    const [liveZoom, setLiveZoom] = useState(() => position.zoom);
    const [relief, setRelief] = useState(() => readStored(MAP_RELIEF_KEY, isBoolean) ?? false);
    useEffect(() => {
        setLiveZoom(position.zoom);
    }, [position.zoom]);
    const palette = relief ? RELIEF_MAP : SCHEMATIC_MAP;
    useEffect(() => {
        writeStored(MAP_RELIEF_KEY, relief);
    }, [relief]);
    useEffect(() => {
        writeStored(MAP_VIEW_KEY, position);
    }, [position]);
    const [revealed, setRevealed] = useState(false);
    const revealing = selectedSatellite ?? (coverageGaps.length ? focusClientId : null);
    useEffect(() => {
        if (!revealing) {
            setRevealed(false);
            return;
        }
        setRevealed(false);
        const frame = requestAnimationFrame(() => setRevealed(true));
        return () => cancelAnimationFrame(frame);
    }, [revealing]);
    const coverageSat = selectedSatellite ? satellites.find(s => s.id === selectedSatellite) : undefined;
    const coverageShape = coverageSat
        ? {
            type: 'FeatureCollection' as const,
            features: [
                {
                    type: 'Feature' as const,
                    properties: {},
                    geometry: geoCircle()
                        .center([coverageSat.lon, coverageSat.lat])
                        .radius(coverageDegrees)()
                }
            ]
        }
        : null;
    const handleZoomIn = () => setPosition(pos => (pos.zoom >= 8 ? pos : { ...pos, zoom: pos.zoom * 1.5 }));
    const handleZoomOut = () => setPosition(pos => (pos.zoom <= 1 ? pos : { ...pos, zoom: pos.zoom / 1.5 }));
    const handleReset = () => setPosition({ coordinates: [0, 0], zoom: 1 });
    const handleMoveEnd = (pos: {
        coordinates: [
            number,
            number
        ];
        zoom: number;
    }) => {
        setPosition({ coordinates: pos.coordinates, zoom: pos.zoom });
    };
    const k = 1 / liveZoom;
    const satelliteColor = (sat: SatelliteView) => {
        if (sat.failed)
            return ALARM;
        if (mode === 'resilience')
            return criticalityLevel(sat.criticality).color;
        return sat.color;
    };
    const drawableGaps = coverageGaps.filter(gap => Math.abs(gap.lat) + coverageDegrees < 88);
    const gapShape = drawableGaps.length
        ? {
            type: 'FeatureCollection' as const,
            features: drawableGaps.map(gap => {
                const satellite = satellites.find(s => s.id === gap.id);
                return {
                    type: 'Feature' as const,
                    properties: { color: satellite ? satelliteColor(satellite) : '#ffffff' },
                    geometry: geoCircle()
                        .center([gap.lon, gap.lat])
                        .radius(coverageDegrees)()
                };
            })
        }
        : null;
    const land = useMemo(() => (<>
        <Graticule stroke={palette.graticule} strokeWidth={0.4 * k}/>

        <Geographies geography={geography}>
          {({ geographies }: {
            geographies: any[];
        }) => geographies.map(geo => (<Geography key={geo.rsmKey} geography={geo} fill={palette.land ?? 'transparent'} stroke={palette.rule} strokeWidth={0.4 * k} tabIndex={-1} style={{
                default: { outline: 'none', pointerEvents: 'none' },
                hover: { outline: 'none', pointerEvents: 'none' },
                pressed: { outline: 'none', pointerEvents: 'none' }
            } as any}/>))}
        </Geographies>
      </>), [palette.graticule, palette.land, palette.rule, k]);
    const routeEdges = useMemo(() => routeEdgeIndex(routes), [routes]);
    const routeNodes = useMemo(() => {
        const carried = new Map<string, string>();
        for (const trace of routes) {
            if (!trace.available)
                continue;
            for (const node of trace.path) {
                if (trace.focused || !carried.has(node))
                    carried.set(node, trace.color);
            }
        }
        return carried;
    }, [routes]);
    const renderLink = (source: {
        lat: number;
        lon: number;
    }, target: {
        lat: number;
        lon: number;
    }, route: {
        color: string;
        focused: boolean;
    } | undefined, key: string, masked = false) => {
        const stroke = route ? route.color : masked ? MASKED_LINK : palette.linkIdle;
        const overImagery = Boolean(palette.casing);
        const strokeWidth = (route ? (route.focused ? 1.4 : 1) : overImagery ? 0.55 : 0.5) * k;
        const strokeOpacity = route
            ? route.focused
                ? 1
                : overImagery
                    ? 0.8
                    : 0.7
            : overImagery
                ? 0.7
                : 0.55;
        const diffLon = target.lon - source.lon;
        const runs: Array<[
            [
                number,
                number
            ],
            [
                number,
                number
            ]
        ]> = Math.abs(diffLon) > 180
            ? [
                [
                    [source.lon, source.lat],
                    [Math.sign(source.lon) * 180, (source.lat + target.lat) / 2],
                ],
                [
                    [-Math.sign(source.lon) * 180, (source.lat + target.lat) / 2],
                    [target.lon, target.lat],
                ],
            ]
            : [
                [
                    [source.lon, source.lat],
                    [target.lon, target.lat],
                ],
            ];
        return (<g key={key}>
        {palette.casing
                && runs.map((run, index) => (<Line key={`casing-${index}`} from={run[0]} to={run[1]} stroke={palette.casing as string} strokeWidth={strokeWidth + 1.3 * k} strokeOpacity={route ? 0.75 : 0.5}/>))}
        {runs.map((run, index) => (<Line key={index} from={run[0]} to={run[1]} stroke={stroke} strokeWidth={strokeWidth} strokeOpacity={strokeOpacity} strokeDasharray={masked ? `${2 * k} ${1.5 * k}` : undefined}/>))}
      </g>);
    };
    const siteLabel = (id: string) => (<text x={6 * k} y={2.5 * k} fontSize={5 * k} fill={palette.label} fontFamily="'IBM Plex Mono', monospace" stroke={palette.labelHalo ?? undefined} strokeWidth={palette.labelHalo ? 1.4 * k : undefined} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
      {id}
    </text>);
    return (<div className="relative h-full w-full overflow-hidden" style={{ background: palette.surface }} onMouseMove={event => {
            const { clientX, clientY } = event;
            setTooltip(current => (current ? { ...current, x: clientX, y: clientY } : current));
        }} onMouseLeave={() => setTooltip(null)} onPointerDown={() => setTooltip(null)}>
      <ComposableMap projection="geoEquirectangular" style={{ width: '100%', height: '100%', background: palette.surface, outline: 'none' }}>
        <ZoomableGroup center={position.coordinates} zoom={position.zoom} onMove={(props) => setLiveZoom(props.zoom ?? 1)} onMoveEnd={(props) => handleMoveEnd({ coordinates: props.coordinates ?? [0, 0], zoom: props.zoom ?? 1 })} minZoom={1} maxZoom={8}>
          {relief && (<g style={{ pointerEvents: 'none' }}>
              <image href="/textures/earth-blue-marble.jpg" x={WORLD_LEFT} y={WORLD_TOP} width={WORLD_WIDTH} height={WORLD_HEIGHT} preserveAspectRatio="none"/>

              <image href="/textures/earth-topology.png" x={WORLD_LEFT} y={WORLD_TOP} width={WORLD_WIDTH} height={WORLD_HEIGHT} preserveAspectRatio="none" opacity={0.32} style={{ mixBlendMode: 'overlay' }}/>
            </g>)}

          {land}

          {gapShape && (<Geographies geography={gapShape}>
              {({ geographies }: {
                geographies: any[];
            }) => geographies.map((geo, index) => (<Geography key={`gap-${index}`} geography={geo} tabIndex={-1} fill={geo.properties?.color ?? '#ffffff'} fillOpacity={palette.coverageFill} stroke={geo.properties?.color ?? '#ffffff'} strokeOpacity={palette.coverageStroke} strokeWidth={0.6 * k} opacity={revealed ? 1 : 0} style={{
                    default: {
                        outline: 'none',
                        pointerEvents: 'none',
                        transition: `opacity ${COVERAGE_TWEEN_MS}ms ease-out`,
                    },
                    hover: { outline: 'none', pointerEvents: 'none' },
                    pressed: { outline: 'none', pointerEvents: 'none' }
                } as any}/>))}
            </Geographies>)}

          {coverageShape && coverageSat && (<Geographies geography={coverageShape}>
              {({ geographies }: {
                geographies: any[];
            }) => geographies.map((geo, index) => (<Geography key={`coverage-${index}`} geography={geo} tabIndex={-1} fill={satelliteColor(coverageSat)} fillOpacity={palette.coverageFill} stroke={satelliteColor(coverageSat)} strokeOpacity={palette.coverageStroke} strokeWidth={0.6 * k} opacity={revealed ? 1 : 0} style={{
                    default: {
                        outline: 'none',
                        pointerEvents: 'none',
                        transition: `opacity ${COVERAGE_TWEEN_MS}ms ease-out`,
                    },
                    hover: { outline: 'none', pointerEvents: 'none' },
                    pressed: { outline: 'none', pointerEvents: 'none' }
                } as any}/>))}
            </Geographies>)}

          {links.map((link, index) => {
            const find = (id: string) => satellites.find(s => s.id === id) || groundStations.find(g => g.id === id) || gateways.find(g => g.id === id);
            const source = find(link.source);
            const target = find(link.target);
            if (!source || !target)
                return null;
            const route = routeEdges.get(edgeKey(link.source, link.target));
            const isRoute = Boolean(route);
            const touchesFailedNode = Boolean((source as SatelliteView).failed) || Boolean((target as SatelliteView).failed);
            if (touchesFailedNode && isRoute)
                return null;
            return renderLink(source, target, route, `link-${index}`, link.kind === 'masked');
        })}

          {gateways.map(gateway => (<Marker key={gateway.id} coordinates={[gateway.lon, gateway.lat]}>
              <polygon points={`0,${-4 * k} ${4 * k},0 0,${4 * k} ${-4 * k},0`} fill={palette.site} stroke={palette.casing ?? undefined} strokeWidth={palette.casing ? 1 * k : undefined}/>
              {siteLabel(gateway.id)}
            </Marker>))}

          {groundStations.map(station => {
            const trace = routes.find(item => item.clientId === station.id);
            const tint = trace ? (trace.available ? trace.color : ALARM) : palette.site;
            const stranded = Boolean(trace && !trace.available);
            const size = stranded ? 5.2 : 4;
            return (<Marker key={station.id} coordinates={[station.lon, station.lat]} onClick={onSiteClick ? () => onSiteClick(station.id) : undefined} style={onSiteClick ? { cursor: 'pointer' } : undefined}>
                {palette.casing && (<polygon points={`0,${-size * k} ${size * k},${size * 0.78 * k} ${-size * k},${size * 0.78 * k}`} fill="none" stroke={palette.casing} strokeWidth={2.6 * k} strokeOpacity={0.75}/>)}
                <polygon points={`0,${-size * k} ${size * k},${size * 0.78 * k} ${-size * k},${size * 0.78 * k}`} fill={station.id === focusClientId || stranded
                    ? `${tint}33`
                    : palette.casing
                        ? 'rgba(0,0,0,0.35)'
                        : 'transparent'} stroke={tint} strokeWidth={(station.id === focusClientId || stranded
                    ? palette.casing
                        ? 1.8
                        : 1.6
                    : palette.casing
                        ? 1.2
                        : 1) * k}/>
                {stranded && (<g style={{ pointerEvents: 'none' }}>
                    <title>{t('map.offline', { site: station.id })}</title>
                    <line x1={0} y1={-1.4 * k} x2={0} y2={1.6 * k} stroke={ALARM} strokeWidth={1.1 * k} strokeLinecap="butt"/>
                    <circle cx={0} cy={3 * k} r={0.62 * k} fill={ALARM}/>
                  </g>)}
                {siteLabel(station.id)}
              </Marker>);
        })}

          {satellites.map(sat => {
            const isFailed = sat.failed;
            const isSelected = selectedSatellite === sat.id;
            const isActiveRoute = routeNodes.has(sat.id);
            const isPinging = failurePings.has(sat.id);
            return (<Marker key={sat.id} coordinates={[sat.lon, sat.lat]} onMouseEnter={(event: React.MouseEvent) => setTooltip({
                    content: (<div className="min-w-[132px] border border-rule-strong bg-[black] p-2 font-data text-[11px] shadow-xl">
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
                      </div>),
                    x: event.clientX,
                    y: event.clientY
                })} onMouseLeave={() => setTooltip(null)} onClick={() => onSatelliteClick?.(sat)} onDoubleClickCapture={(event: React.MouseEvent) => event.stopPropagation()} style={{ cursor: onSatelliteClick ? 'pointer' : 'default', outline: 'none' } as any}>

                {isPinging && (<g style={{ pointerEvents: 'none' }}>
                    {Array.from({ length: FAILURE_RING_COUNT }, (_, index) => (<motion.ellipse key={index} rx={failureRingWidth(sat.lat)} ry={failureRingUnits} fill="transparent" stroke={ALARM} strokeWidth={1.4} vectorEffect="non-scaling-stroke" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: [0, 0.95, 0.6, 0] }} transition={{
                            duration: FAILURE_RING_FLIGHT_MS / 1000,
                            delay: (index * FAILURE_RING_INTERVAL_MS) / 1000,
                            ease: 'easeOut',
                            opacity: {
                                duration: FAILURE_RING_FLIGHT_MS / 1000,
                                delay: (index * FAILURE_RING_INTERVAL_MS) / 1000,
                                times: [0, 0.07, 0.55, 1],
                                ease: 'linear'
                            }
                        }}/>))}
                  </g>)}


                <circle r={9 * k} fill="transparent" style={{ cursor: 'pointer' }}/>

                {isFailed ? (<g style={{ pointerEvents: 'none' }}>
                    {palette.casing && (<g stroke={palette.casing} strokeWidth={2.6 * k} fill="none" strokeOpacity={0.75}>
                        <circle r={4 * k}/>
                        <line x1={-2.6 * k} y1={-2.6 * k} x2={2.6 * k} y2={2.6 * k}/>
                        <line x1={-2.6 * k} y1={2.6 * k} x2={2.6 * k} y2={-2.6 * k}/>
                      </g>)}
                    <circle r={4 * k} fill="transparent" stroke={ALARM} strokeWidth={1.2 * k}/>
                    <line x1={-2.6 * k} y1={-2.6 * k} x2={2.6 * k} y2={2.6 * k} stroke={ALARM} strokeWidth={1.2 * k}/>
                    <line x1={-2.6 * k} y1={2.6 * k} x2={2.6 * k} y2={-2.6 * k} stroke={ALARM} strokeWidth={1.2 * k}/>
                  </g>) : (<circle r={(isSelected || isActiveRoute ? 3.4 : palette.casing ? 2.4 : 2.3) * k} fill={satelliteColor(sat)} opacity={palette.casing ? 1 : 0.9} stroke={palette.casing ?? undefined} strokeWidth={palette.casing ? 1 * k : undefined} style={{ pointerEvents: 'none' }}/>)}

                {isSelected && (<motion.circle r={7 * k} fill="transparent" stroke={palette.selection} strokeWidth={1.2 * k} strokeDasharray={`${1.5 * k},${1.5 * k}`} style={{ pointerEvents: 'none' }} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }}/>)}

                {isActiveRoute && !isSelected && (<circle r={5.5 * k} fill="transparent" stroke={palette.routeHalo} strokeWidth={0.5 * k} opacity={0.6} style={{ pointerEvents: 'none' }}/>)}
              </Marker>);
        })}
        </ZoomableGroup>
      </ComposableMap>

      {tooltip && (<div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full pb-3" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.content}
        </div>)}


      <div className="absolute bottom-16 right-3 z-20 flex flex-col border border-rule-strong bg-black/85 backdrop-blur lg:bottom-[4.5rem] lg:right-6">
        {[
            { label: t('map.zoomIn'), icon: <Plus size={14}/>, onClick: handleZoomIn },
            { label: t('map.zoomOut'), icon: <Minus size={14}/>, onClick: handleZoomOut },
            { label: t('map.reset'), icon: <RotateCcw size={13}/>, onClick: handleReset },
            {
                label: relief ? t('map.schematic') : t('map.relief'),
                icon: relief ? <Moon size={13}/> : <Sun size={13}/>,
                onClick: () => setRelief(value => !value),
            },
        ].map(control => (<button key={control.label} type="button" onClick={control.onClick} title={control.label} aria-label={control.label} className="flex h-7 w-7 items-center justify-center border-t border-rule-strong text-zinc-500 transition-colors first:border-t-0 hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:bg-white/15 focus-visible:text-zinc-100 focus-visible:outline-none">
            {control.icon}
          </button>))}
      </div>
    </div>);
};
