import { decodeProgram, emptyProgram, type Program } from './program';

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  expect?: { trick: string; status: 'landed' }; // checked by scripts/test.ts
  program: () => Program;
}

// Codes were found with scripts/search.ts and are verified by `npm test`.
// If you change anything in sim/config.ts, re-run the search and update them.
const code = (c: string) => () => decodeProgram(c) ?? emptyProgram();

export const PRESETS: Preset[] = [
  {
    id: 'blank',
    name: 'Blank',
    blurb: 'No thrusters. Tap cells to build your own flip.',
    program: emptyProgram,
  },
  {
    id: 'kickflip',
    name: 'Kickflip (event style)',
    blurb: 'One full roll over the lineup, then the lift thrusters soften the landing.',
    expect: { trick: 'Kickflip', status: 'landed' },
    program: code('1.ABgAAAAAIAAAAAAAAAAAAADgAQAAABgADgAAAAAPAAAYAA4AAAAADwAAAPABAAAAAwA'),
  },
  {
    id: 'double',
    name: 'Double kickflip',
    blurb: 'Two rolls with less gas than the event version, but a harder landing.',
    expect: { trick: 'Double Kickflip', status: 'landed' },
    program: code('1.AAAAAAAAQAAAAAAAAAAAAACAAAAAAAAMAAAAOAQAAAAAAAAAAA4DAAAAAAAAAAAAAAA'),
  },
  {
    id: 'backflip',
    name: 'Backflip',
    blurb: 'Front lifts kick the nose up and over, rear lifts stop the rotation.',
    expect: { trick: 'Backflip', status: 'landed' },
    program: code('1.AAAAAQAAYAAAAAAAAAAAAgAAAAAAZwAAAABwAAAAAAAABAAAAAAAMAAAAAAAAAAAQAA'),
  },
  {
    id: 'soft',
    name: 'Soft landing',
    blurb: 'No tricks. Spends the tank slowing the fall so it touches down gently.',
    expect: { trick: 'Straight jump', status: 'landed' },
    program: code('1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD-DwAAAIAPAAAAAA4AAAB-DAAgAAAAAAAAHAA'),
  },
];

export const DEFAULT_PRESET = 'kickflip';
