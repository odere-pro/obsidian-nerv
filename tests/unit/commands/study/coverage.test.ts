// Tests coverage metric calculation with the pure computeCoverage function.

import { describe, expect, test } from 'bun:test';
import { computeCoverage } from '../../../../src/commands/study/coverage';

describe('computeCoverage', () => {
  test('computes coverage percentage as stable/total*100', () => {
    const notes = [
      { spine: 'networking', status: 'stable' },
      { spine: 'networking', status: 'stable' },
      { spine: 'networking', status: 'draft' },
      { spine: 'networking', status: 'review' },
    ];
    const result = computeCoverage(notes);
    const domain = result.domains.find(d => d.spine === 'networking');
    expect(domain).toBeDefined();
    expect(domain!.total).toBe(4);
    expect(domain!.stable).toBe(2);
    expect(domain!.coverage).toBe(50);
  });

  test('returns 0 coverage for all-draft domain', () => {
    const notes = [
      { spine: 'storage', status: 'draft' },
      { spine: 'storage', status: 'draft' },
    ];
    const result = computeCoverage(notes);
    const domain = result.domains.find(d => d.spine === 'storage');
    expect(domain!.coverage).toBe(0);
    expect(domain!.stable).toBe(0);
  });

  test('overall.totalNotes counts all notes across spines', () => {
    const notes = [
      { spine: 'a', status: 'stable' },
      { spine: 'b', status: 'draft' },
      { spine: 'c', status: 'review' },
    ];
    const result = computeCoverage(notes);
    expect(result.overall.totalNotes).toBe(3);
  });

  test('groups notes without spine under __unspined__', () => {
    const notes = [
      { spine: '', status: 'stable' },
      { spine: '', status: 'draft' },
    ];
    const result = computeCoverage(notes);
    const unspined = result.domains.find(d => d.spine === '__unspined__');
    expect(unspined).toBeDefined();
    expect(unspined!.total).toBe(2);
  });

  test('domains list is sorted alphabetically by spine', () => {
    const notes = [
      { spine: 'z-spine', status: 'draft' },
      { spine: 'a-spine', status: 'stable' },
      { spine: 'm-spine', status: 'review' },
    ];
    const result = computeCoverage(notes);
    const spines = result.domains.map(d => d.spine);
    expect(spines).toEqual([...spines].sort());
  });
});
