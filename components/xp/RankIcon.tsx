/**
 * RankIcon
 *
 * Premium SVG hexagon badges for all 20 XP ranks.
 * Each rank has a unique geometric icon inside a flat-top hexagon.
 */

import React from 'react';
import Svg, {
  Path,
  Circle,
  G,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  ClipPath,
  Rect,
} from 'react-native-svg';

interface RankIconProps {
  tierIndex: number;
  size?: number;
  color: string;
  gradientColor?: string;
}

// Flat-top hexagon points at cx=24, cy=24, radius r
// Angles: 0°, 60°, 120°, 180°, 240°, 300°
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    pts.push(x.toFixed(3) + ',' + y.toFixed(3));
  }
  return pts.join(' ');
}

function hexPath(cx: number, cy: number, r: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return (
    'M ' +
    pts.map((p, i) => (i === 0 ? p[0].toFixed(3) + ' ' + p[1].toFixed(3) : 'L ' + p[0].toFixed(3) + ' ' + p[1].toFixed(3))).join(' ') +
    ' Z'
  );
}

// Darken a hex color by multiplying RGB by factor
function darkenColor(hex: string, factor: number): string {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.substring(0, 2), 16) * factor);
  const g = Math.round(parseInt(h.substring(2, 4), 16) * factor);
  const b = Math.round(parseInt(h.substring(4, 6), 16) * factor);
  return (
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  );
}

// ─── Individual rank icons (all drawn in 48×48 space, centered at 24,24) ───

// 0 — Rookie: two upward chevrons stacked
function RookieIcon() {
  return (
    <G>
      <Path
        d="M17 22 L24 15 L31 22"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M17 28 L24 21 L31 28"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
  );
}

// 1 — Novice: sprout with stem and two leaves
function NoviceIcon() {
  return (
    <G>
      {/* Stem */}
      <Path
        d="M24 33 L24 22"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Left leaf */}
      <Path
        d="M24 26 C20 24 16 20 18 16 C20 16 23 19 24 22"
        fill="#FFFFFF"
        opacity={0.9}
      />
      {/* Right leaf */}
      <Path
        d="M24 26 C28 24 32 20 30 16 C28 16 25 19 24 22"
        fill="#FFFFFF"
        opacity={0.9}
      />
    </G>
  );
}

// 2 — Challenger: crosshair/target
function ChallengerIcon() {
  return (
    <G>
      {/* Outer circle */}
      <Circle cx={24} cy={24} r={9} fill="none" stroke="#FFFFFF" strokeWidth="2" />
      {/* Inner circle */}
      <Circle cx={24} cy={24} r={3} fill="#FFFFFF" />
      {/* N tick */}
      <Path d="M24 13 L24 16" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      {/* S tick */}
      <Path d="M24 32 L24 35" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      {/* W tick */}
      <Path d="M13 24 L16 24" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      {/* E tick */}
      <Path d="M32 24 L35 24" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    </G>
  );
}

// 3 — Athlete: running stick figure
function AthleteIcon() {
  return (
    <G>
      {/* Head */}
      <Circle cx={26} cy={14} r={2.5} fill="#FFFFFF" />
      {/* Torso */}
      <Path
        d="M26 17 L23 24"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Arm forward */}
      <Path
        d="M25 19 L30 21"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Arm back */}
      <Path
        d="M25 20 L20 22"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Leg forward */}
      <Path
        d="M23 24 L27 30 L30 34"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Leg back */}
      <Path
        d="M23 24 L20 30 L18 34"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
  );
}

// 4 — Warrior: upward sword
function WarriorIcon() {
  return (
    <G>
      {/* Blade */}
      <Path
        d="M24 12 L24 30"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Blade tip */}
      <Path
        d="M22 15 L24 12 L26 15"
        fill="#FFFFFF"
        stroke="#FFFFFF"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Crossguard */}
      <Path
        d="M18 28 L30 28"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Grip */}
      <Path
        d="M24 30 L24 34"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Pommel */}
      <Circle cx={24} cy={35.5} r={2} fill="#FFFFFF" />
    </G>
  );
}

// 5 — Fighter: boxing glove
function FighterIcon() {
  return (
    <G>
      {/* Main glove body */}
      <Path
        d="M18 20 C18 16 20 14 24 14 C28 14 30 16 30 20 L30 28 C30 30 28 32 24 32 C20 32 18 30 18 28 Z"
        fill="#FFFFFF"
        opacity={0.9}
      />
      {/* Thumb bump */}
      <Path
        d="M18 20 C16 19 15 21 16 23 C17 25 18 24 18 23"
        fill="#FFFFFF"
      />
      {/* Wrist band */}
      <Path
        d="M18 30 L30 30"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Knuckle lines */}
      <Path
        d="M20 17 L28 17"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </G>
  );
}

// 6 — Grinder: kettlebell
function GrinderIcon() {
  return (
    <G>
      {/* Handle arc */}
      <Path
        d="M19 22 C19 17 29 17 29 22"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Body circle */}
      <Circle cx={24} cy={27} r={8} fill="#FFFFFF" opacity={0.9} />
      {/* Flat bottom cut */}
      <Rect x={16} y={33} width={16} height={3} fill="#FFFFFF" opacity={0.9} rx={1} />
    </G>
  );
}

// 7 — Dedicated: flame with inner highlight
function DedicatedIcon() {
  return (
    <G>
      {/* Outer flame */}
      <Path
        d="M24 12 C24 12 30 18 30 24 C30 29 27.5 33 24 33 C20.5 33 18 29 18 24 C18 20 20 16 22 14 C22 17 23 19 24 21 C25 19 25 15 24 12 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* Inner flame highlight */}
      <Path
        d="M24 18 C24 18 27 22 27 25.5 C27 28 25.8 30 24 30 C22.2 30 21 28 21 25.5 C21 23 22.5 20 24 18 Z"
        fill="rgba(255,255,255,0.4)"
      />
    </G>
  );
}

// 8 — Iron Mind: brain
function IronMindIcon() {
  return (
    <G>
      {/* Left lobe */}
      <Path
        d="M14 24 C14 18 18 14 22 14 C23 14 23.5 14.5 23.5 15 L23.5 33 C23.5 33.5 23 34 22 34 C18 34 14 30 14 24 Z"
        fill="#FFFFFF"
        opacity={0.9}
      />
      {/* Right lobe */}
      <Path
        d="M34 24 C34 18 30 14 26 14 C25 14 24.5 14.5 24.5 15 L24.5 33 C24.5 33.5 25 34 26 34 C30 34 34 30 34 24 Z"
        fill="#FFFFFF"
        opacity={0.9}
      />
      {/* Center dividing line */}
      <Path
        d="M24 14 L24 34"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="1"
      />
      {/* Left wrinkles */}
      <Path
        d="M16 20 C18 19 20 20 19 22"
        fill="none"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <Path
        d="M15 26 C17 25 20 26 19 28"
        fill="none"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Right wrinkles */}
      <Path
        d="M32 20 C30 19 28 20 29 22"
        fill="none"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <Path
        d="M33 26 C31 25 28 26 29 28"
        fill="none"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </G>
  );
}

// 9 — Titan: Spartan helmet (front view)
function TitanIcon() {
  return (
    <G>
      {/* Dome */}
      <Path
        d="M15 24 C15 16 19 12 24 12 C29 12 33 16 33 24 L33 30 C33 32 31 34 29 34 L19 34 C17 34 15 32 15 30 Z"
        fill="#FFFFFF"
        opacity={0.9}
      />
      {/* T-visor opening */}
      <Path
        d="M21 20 L27 20 L27 22 L25.5 22 L25.5 28 L22.5 28 L22.5 22 L21 22 Z"
        fill="rgba(0,0,0,0.25)"
      />
      {/* Crest base */}
      <Path
        d="M20 12 L28 12 L28 14 L20 14 Z"
        fill="#FFFFFF"
        opacity={0.7}
      />
    </G>
  );
}

// 10 — Elite: crown
function EliteIcon() {
  return (
    <G>
      {/* Crown base */}
      <Path
        d="M15 30 L15 26 L18 18 L21 24 L24 14 L27 24 L30 18 L33 26 L33 30 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* Base band */}
      <Rect x={15} y={29} width={18} height={3} fill="#FFFFFF" rx={1} />
      {/* Dots on points */}
      <Circle cx={24} cy={15} r={1.5} fill="#FFFFFF" opacity={0.6} />
      <Circle cx={18} cy={19} r={1.2} fill="#FFFFFF" opacity={0.6} />
      <Circle cx={30} cy={19} r={1.2} fill="#FFFFFF" opacity={0.6} />
    </G>
  );
}

// 11 — Champion: trophy
function ChampionIcon() {
  return (
    <G>
      {/* Cup */}
      <Path
        d="M17 13 L31 13 L29 24 C29 27 27 29 24 29 C21 29 19 27 19 24 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* Left handle */}
      <Path
        d="M17 13 C14 13 13 16 14 19 C15 21 17 21 17 20"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Right handle */}
      <Path
        d="M31 13 C34 13 35 16 34 19 C33 21 31 21 31 20"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Stem */}
      <Path
        d="M24 29 L24 33"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Base */}
      <Rect x={18} y={33} width={12} height={2.5} fill="#FFFFFF" rx={1.2} />
    </G>
  );
}

// 12 — Master: 6-pointed star
function MasterIcon() {
  return (
    <G>
      {/* Triangle pointing up */}
      <Path
        d="M24 13 L31.5 26 L16.5 26 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* Triangle pointing down */}
      <Path
        d="M24 35 L16.5 22 L31.5 22 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
    </G>
  );
}

// 13 — Grandmaster: shield with star
function GrandmasterIcon() {
  return (
    <G>
      {/* Shield outline */}
      <Path
        d="M24 12 L33 16 L33 25 C33 30 29 34 24 36 C19 34 15 30 15 25 L15 16 Z"
        fill="#FFFFFF"
        opacity={0.9}
      />
      {/* Inner star (5-point) */}
      <Path
        d="M24 18 L25.2 22 L29 22 L26 24.5 L27.2 28.5 L24 26 L20.8 28.5 L22 24.5 L19 22 L22.8 22 Z"
        fill="rgba(0,0,0,0.2)"
      />
    </G>
  );
}

// 14 — Legend: spread wings
function LegendIcon() {
  return (
    <G>
      {/* Left wing */}
      <Path
        d="M24 24 C22 22 18 20 14 22 C16 20 18 17 21 17 C22 17 23 18 24 20"
        fill="#FFFFFF"
        opacity={0.95}
      />
      <Path
        d="M24 24 C21 23 17 23 13 26 C15 23 18 20 21 20 C22.5 20 23.5 21 24 23"
        fill="#FFFFFF"
        opacity={0.75}
      />
      <Path
        d="M24 24 C21 24 17 26 14 30 C16 26 19 23 22 23 C23 23 23.5 23.5 24 24"
        fill="#FFFFFF"
        opacity={0.55}
      />
      {/* Right wing */}
      <Path
        d="M24 24 C26 22 30 20 34 22 C32 20 30 17 27 17 C26 17 25 18 24 20"
        fill="#FFFFFF"
        opacity={0.95}
      />
      <Path
        d="M24 24 C27 23 31 23 35 26 C33 23 30 20 27 20 C25.5 20 24.5 21 24 23"
        fill="#FFFFFF"
        opacity={0.75}
      />
      <Path
        d="M24 24 C27 24 31 26 34 30 C32 26 29 23 26 23 C25 23 24.5 23.5 24 24"
        fill="#FFFFFF"
        opacity={0.55}
      />
    </G>
  );
}

// 15 — Mythic: diamond gem with facets
function MythicIcon() {
  return (
    <G>
      {/* Top triangle */}
      <Path
        d="M24 13 L32 22 L16 22 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* Bottom triangle */}
      <Path
        d="M24 35 L32 22 L16 22 Z"
        fill="#FFFFFF"
        opacity={0.8}
      />
      {/* Left facet line */}
      <Path
        d="M16 22 L24 13"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="1"
      />
      {/* Right facet line */}
      <Path
        d="M32 22 L24 13"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="1"
      />
      {/* Center facet line */}
      <Path
        d="M16 22 L24 35 L32 22"
        stroke="rgba(0,0,0,0.1)"
        strokeWidth="1"
      />
    </G>
  );
}

// 16 — Immortal: infinity symbol
function ImmortalIcon() {
  return (
    <G>
      {/* Left loop */}
      <Path
        d="M24 24 C22 20 16 18 14 22 C12 26 16 30 20 28 C22 27 23 25 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Right loop */}
      <Path
        d="M24 24 C26 20 32 18 34 22 C36 26 32 30 28 28 C26 27 25 25 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </G>
  );
}

// 17 — Ascendant: upward arrow with wings
function AscendantIcon() {
  return (
    <G>
      {/* Arrow shaft */}
      <Path
        d="M24 13 L24 33"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Arrow head */}
      <Path
        d="M18 20 L24 13 L30 20"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left wing */}
      <Path
        d="M24 22 C22 20 18 20 16 23"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Right wing */}
      <Path
        d="M24 22 C26 20 30 20 32 23"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </G>
  );
}

// 18 — Transcendent: 8-pointed compass star
function TranscendentIcon() {
  return (
    <G>
      {/* 4 long cardinal points */}
      <Path
        d="M24 12 L26 22 L24 24 L22 22 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      <Path
        d="M24 36 L26 26 L24 24 L22 26 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      <Path
        d="M12 24 L22 22 L24 24 L22 26 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      <Path
        d="M36 24 L26 22 L24 24 L26 26 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* 4 shorter diagonal points */}
      <Path
        d="M15.5 15.5 L22 22 L24 24 L22 22 Z"
        fill="#FFFFFF"
        opacity={0.7}
      />
      <Path
        d="M32.5 15.5 L26 22 L24 24 L26 22 Z"
        fill="#FFFFFF"
        opacity={0.7}
      />
      <Path
        d="M15.5 32.5 L22 26 L24 24 L22 26 Z"
        fill="#FFFFFF"
        opacity={0.7}
      />
      <Path
        d="M32.5 32.5 L26 26 L24 24 L26 26 Z"
        fill="#FFFFFF"
        opacity={0.7}
      />
    </G>
  );
}

// 19 — Apex: phoenix rising
function ApexIcon() {
  return (
    <G>
      {/* Body */}
      <Path
        d="M24 16 C24 16 22 20 22 23 C22 25 23 26 24 26 C25 26 26 25 26 23 C26 20 24 16 24 16 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* Left wing upper */}
      <Path
        d="M24 20 C21 17 16 16 13 19 C15 17 18 15 21 16 C22 16.5 23 18 24 20"
        fill="#FFFFFF"
        opacity={0.9}
      />
      {/* Left wing lower */}
      <Path
        d="M24 22 C20 21 15 22 13 26 C15 22 18 19 22 20 C23 20.5 23.5 21 24 22"
        fill="#FFFFFF"
        opacity={0.7}
      />
      {/* Right wing upper */}
      <Path
        d="M24 20 C27 17 32 16 35 19 C33 17 30 15 27 16 C26 16.5 25 18 24 20"
        fill="#FFFFFF"
        opacity={0.9}
      />
      {/* Right wing lower */}
      <Path
        d="M24 22 C28 21 33 22 35 26 C33 22 30 19 26 20 C25 20.5 24.5 21 24 22"
        fill="#FFFFFF"
        opacity={0.7}
      />
      {/* Head */}
      <Circle cx={24} cy={14} r={2} fill="#FFFFFF" opacity={0.95} />
      {/* Tail feathers */}
      <Path
        d="M22 26 C20 29 17 31 15 34"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.8}
      />
      <Path
        d="M24 26 C24 30 24 32 24 35"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.8}
      />
      <Path
        d="M26 26 C28 29 31 31 33 34"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.8}
      />
    </G>
  );
}

const RANK_ICONS = [
  RookieIcon,
  NoviceIcon,
  ChallengerIcon,
  AthleteIcon,
  WarriorIcon,
  FighterIcon,
  GrinderIcon,
  DedicatedIcon,
  IronMindIcon,
  TitanIcon,
  EliteIcon,
  ChampionIcon,
  MasterIcon,
  GrandmasterIcon,
  LegendIcon,
  MythicIcon,
  ImmortalIcon,
  AscendantIcon,
  TranscendentIcon,
  ApexIcon,
];

export default function RankIcon({
  tierIndex,
  size = 48,
  color,
  gradientColor,
}: RankIconProps) {
  const idx = Math.max(0, Math.min(19, tierIndex));
  const IconComponent = RANK_ICONS[idx];
  const shadowColor = darkenColor(color.startsWith('#') ? color : '#6B7280', 0.55);
  const useGradient = (idx === 18 || idx === 19) && !!gradientColor;
  const gradId = 'rankGrad_' + idx;
  const clipId = 'rankClip_' + idx;

  const shadowHex = hexPath(24, 24, 22);
  const mainHex = hexPath(24, 24, 20);
  const strokeHex = hexPath(24, 24, 19.5);

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        {useGradient && (
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={gradientColor} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </SvgLinearGradient>
        )}
        <ClipPath id={clipId}>
          <Path d={mainHex} />
        </ClipPath>
      </Defs>

      {/* Shadow hexagon */}
      <Path d={shadowHex} fill={shadowColor} opacity={0.6} />

      {/* Main hexagon fill */}
      <Path
        d={mainHex}
        fill={useGradient ? 'url(#' + gradId + ')' : color}
      />

      {/* Icon clipped to hexagon */}
      <G clipPath={'url(#' + clipId + ')'}>
        <IconComponent />
      </G>

      {/* Inner stroke highlight */}
      <Path
        d={strokeHex}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.2"
      />
    </Svg>
  );
}
