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
    blurb: 'No thrusters, so it drives straight into the lineup. Build your own jump.',
    program: emptyProgram,
  },
  {
    id: 'kickflip',
    name: 'Kickflip (event style)',
    blurb: 'All four lifts throw it up, one side spins it over the lineup, then all four cushion the landing.',
    expect: { trick: 'Kickflip', status: 'landed' },
    program: code('1.AAAAAAAAAAAAAAAQAAAAAAYAAACAGwAcALADADwAwAMAHACAAxgcAAAIAAAAAAAAAAA'),
  },
  {
    id: 'double',
    name: 'Double kickflip',
    blurb: 'Two rolls on less gas than the event version, but it lands hard.',
    expect: { trick: 'Double Kickflip', status: 'landed' },
    program: code('1.AAAAAAAAAAAAAAAAAAAAAAAAAACAOwAAAMADOAAAgD8AAADAATgAAMABAAAAAAAAMAA'),
  },
  {
    id: 'backflip',
    name: 'Backflip',
    blurb: 'Front lifts kick the nose up and over the lineup; the rear lifts stop the rotation.',
    expect: { trick: 'Backflip', status: 'landed' },
    program: code('1.AAAAAACAAQAAAAAAEAAAAAAAAADAOYAAAMAfwAEAwAMGAAAADgAAAAAAAAAAAAAAAAA'),
  },
  {
    id: 'soft',
    name: 'Soft landing',
    blurb: 'No tricks. Hops the lineup and spends the rest of the tank on a gentle touchdown.',
    expect: { trick: 'Straight jump', status: 'landed' },
    program: code('1.AAAAACAAAAAAAAAQAACAAAYAADiAGwAcALADAHgAwAMAHACAAxgcAAAIAAAAAAAAAAA'),
  },
];

export const DEFAULT_PRESET = 'kickflip';
