import { decodeProgram, emptyProgram, type Program } from './program';

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  expect?: { trick: string; status: 'landed' }; // checked by scripts/test.ts
  // Presets are tuned on the standard tank; loading one switches the tank back to standard.
  ramp?: boolean; // tuned with the optional ramp on; loading the preset turns it on
  program: () => Program;
}

// Codes were found with scripts/search.ts and are verified by `npm test`.
// If you change anything in sim/config.ts, re-run the search and update them.
const code = (c: string) => () => decodeProgram(c) ?? emptyProgram();

export const PRESETS: Preset[] = [
  {
    id: 'blank',
    name: 'Blank',
    blurb: 'No thrusters, so it drives straight into the lineup. Build your own jump.',
    program: emptyProgram,
  },
  {
    id: 'kickflip',
    name: 'Kickflip',
    blurb: 'Straight up on all four lifts, then one side rolls it over the semi at the top of the arc, then all four cushion the landing.',
    expect: { trick: 'Kickflip', status: 'landed' },
    program: code('1.AAAAIAAAABwAAAAAAQAAAAA4AADAAwD8AOABACYAwMMBgADAAxj8AEAAgAMAAAAYMAA'),
  },
  {
    id: '180',
    name: '180 kickflip to fakie',
    blurb: 'A short burst on Rear L spin turns it half round while it rolls, so it lands and rolls away backwards.',
    expect: { trick: '180 Kickflip to fakie', status: 'landed' },
    program: code('1.AIcDAAAAAAAAAAABAAAAAAB4AADAAUAAAOCDAQAAgBcAAADAAzAAAMAABAAAABAAAAA'),
  },
  {
    id: '360',
    name: '360 kickflip',
    blurb: 'Rear L spin turns it a full circle during the roll. Land within 20° of straight or it spins out.',
    expect: { trick: '360 Kickflip', status: 'landed' },
    program: code('1.AP4BAAAAAMAOAAAACAAAAAAAAADAAwMACMAHAOQAgAcDADzAAwAAGEAAAAAOAABwAAA'),
  },
  {
    id: 'double',
    name: 'Double kickflip',
    blurb: 'Two rolls on less gas than the event version, but it lands hard.',
    expect: { trick: 'Double Kickflip', status: 'landed' },
    program: code('1.AAAAAAAAAAAAAAAADAAAAAAAAAAAfgAAAMAHGEAAgD8AAACABBwAAAAAADgAAAAAAAA'),
  },
  {
    id: 'triple',
    name: 'Triple kickflip',
    blurb: 'Three rolls over the lineup, with the roof roll jets keeping it spinning.',
    expect: { trick: 'Triple Kickflip', status: 'landed' },
    program: code('1.AAAAAAAAAABgAAAYAAAAAAAABgAABwAgAIAPAAAAgD8AMADAAQAAAAAHAAYAAAAAAAE'),
  },
  {
    id: 'backflip',
    name: 'Backflip',
    blurb: 'Front lifts burn longer on take-off, kicking the nose up and over the lineup.',
    expect: { trick: 'Backflip', status: 'landed' },
    program: code('1.AACAAAAAAEAAAAAAAAAAAAIGAADABwAYAMAHAAAAwQEAAADAAQAMAAAAABAAAgAAIAA'),
  },
  {
    id: 'soft',
    name: 'Soft landing',
    blurb: 'No tricks. Stays level over the lineup and spends the rest of the tank on a gentle touchdown.',
    expect: { trick: 'Straight jump', status: 'landed' },
    program: code('1.AAAAAAAgAIAAAAAAAAAAAAAAAADAAwAcBsADANABwQMAHADAAwAHAAAAAAAAAAAAAAA'),
  },
];

// appended so existing preset order stays the same
PRESETS.push({
  id: 'ramp',
  name: 'Ramp kickflip',
  blurb: 'The ramp does the launch, so a roll costs about a third of the gas. Loading this turns the ramp on.',
  ramp: true,
  expect: { trick: 'Kickflip', status: 'landed' },
  program: code('1.AAAAAQAAAAAAAAAAgAEAAAAAAAAAAAEADgAAABgAAAMAAAAAAIABDAAAAAAAAIAADgA'),
});

export const DEFAULT_PRESET = 'kickflip';
