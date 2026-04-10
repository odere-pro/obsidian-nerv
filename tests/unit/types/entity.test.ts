import { describe, expect, test } from 'bun:test';
import {
  NoteEntityModel,
  EntityTypes,
  EntityStatuses,
  type NoteEntity,
} from '../../../src/types/entity';

function makeEntity(overrides: Partial<NoteEntity> = {}): NoteEntity {
  return {
    title: 'Test Entity',
    type: 'BRANCH',
    kind: 'concept',
    spine: 'domain/testing',
    status: 'draft',
    parent: '[[Parent Note]]',
    children: ['[[Child A]]'],
    aliases: ['alias-one', 'alias-two'],
    attachments: ['diagram.png'],
    created: '2026-04-10',
    modified: '2026-04-10',
    tags: ['#test', '#domain'],
    ...overrides,
  };
}

describe('NoteEntityModel', () => {
  describe('constructor', () => {
    test('preserves all fields from NoteEntity', () => {
      const entity = makeEntity();
      const model = new NoteEntityModel(entity);

      expect(model.title).toBe('Test Entity');
      expect(model.type).toBe('BRANCH');
      expect(model.kind).toBe('concept');
      expect(model.spine).toBe('domain/testing');
      expect(model.status).toBe('draft');
      expect(model.parent).toBe('[[Parent Note]]');
      expect(model.children).toEqual(['[[Child A]]']);
      expect(model.aliases).toEqual(['alias-one', 'alias-two']);
      expect(model.attachments).toEqual(['diagram.png']);
      expect(model.created).toBe('2026-04-10');
      expect(model.modified).toBe('2026-04-10');
      expect(model.tags).toEqual(['#test', '#domain']);
    });

    test('defensively copies arrays', () => {
      const entity = makeEntity();
      const model = new NoteEntityModel(entity);

      entity.children.push('[[Mutated]]');
      entity.aliases.push('mutated');
      entity.tags.push('#mutated');

      expect(model.children).toEqual(['[[Child A]]']);
      expect(model.aliases).toEqual(['alias-one', 'alias-two']);
      expect(model.tags).toEqual(['#test', '#domain']);
    });
  });

  describe('addChild', () => {
    test('preserves all metadata fields after adding a child', () => {
      const model = new NoteEntityModel(makeEntity());
      const updated = model.addChild('[[Child B]]');

      expect(updated.children).toEqual(['[[Child A]]', '[[Child B]]']);
      expect(updated.aliases).toEqual(['alias-one', 'alias-two']);
      expect(updated.attachments).toEqual(['diagram.png']);
      expect(updated.created).toBe('2026-04-10');
      expect(updated.modified).toBe('2026-04-10');
      expect(updated.tags).toEqual(['#test', '#domain']);
    });

    test('returns same instance for duplicate child', () => {
      const model = new NoteEntityModel(makeEntity());
      const same = model.addChild('[[Child A]]');

      expect(same).toBe(model);
    });

    test('does not mutate the original model', () => {
      const model = new NoteEntityModel(makeEntity());
      const updated = model.addChild('[[Child B]]');

      expect(model.children).toEqual(['[[Child A]]']);
      expect(updated.children).toEqual(['[[Child A]]', '[[Child B]]']);
    });
  });

  describe('validate', () => {
    test('ROOT with parent returns violation', () => {
      const model = new NoteEntityModel(makeEntity({ type: 'ROOT', parent: '[[Something]]' }));
      const issues = model.validate();

      expect(issues).toContain('ROOT entity must not have a parent');
    });

    test('ROOT without parent passes', () => {
      const model = new NoteEntityModel(makeEntity({ type: 'ROOT', parent: null }));
      const issues = model.validate();

      expect(issues).toEqual([]);
    });

    test('LEAF without parent returns violation', () => {
      const model = new NoteEntityModel(makeEntity({ type: 'LEAF', parent: null }));
      const issues = model.validate();

      expect(issues).toContain('LEAF entity must have a non-empty parent');
    });

    test('BRANCH without parent returns violation', () => {
      const model = new NoteEntityModel(makeEntity({ type: 'BRANCH', parent: '' }));
      const issues = model.validate();

      expect(issues).toContain('BRANCH entity must have a non-empty parent');
    });

    test('BRANCH with parent passes', () => {
      const model = new NoteEntityModel(makeEntity({ type: 'BRANCH', parent: '[[Parent]]' }));
      const issues = model.validate();

      expect(issues).toEqual([]);
    });
  });

  describe('isRoot / requiresParent', () => {
    test('isRoot returns true for ROOT', () => {
      const model = new NoteEntityModel(makeEntity({ type: 'ROOT', parent: null }));
      expect(model.isRoot()).toBe(true);
    });

    test('isRoot returns false for LEAF', () => {
      const model = new NoteEntityModel(makeEntity({ type: 'LEAF' }));
      expect(model.isRoot()).toBe(false);
    });

    test('requiresParent returns true for BRANCH and LEAF', () => {
      const branch = new NoteEntityModel(makeEntity({ type: 'BRANCH' }));
      const leaf = new NoteEntityModel(makeEntity({ type: 'LEAF' }));

      expect(branch.requiresParent()).toBe(true);
      expect(leaf.requiresParent()).toBe(true);
    });

    test('requiresParent returns false for ROOT', () => {
      const root = new NoteEntityModel(makeEntity({ type: 'ROOT', parent: null }));
      expect(root.requiresParent()).toBe(false);
    });
  });
});

describe('EntityTypes', () => {
  test('parse accepts valid types case-insensitively', () => {
    expect(EntityTypes.parse('leaf')).toBe('LEAF');
    expect(EntityTypes.parse('BRANCH')).toBe('BRANCH');
    expect(EntityTypes.parse('Root')).toBe('ROOT');
  });

  test('parse throws for invalid type', () => {
    expect(() => EntityTypes.parse('invalid')).toThrow();
  });
});

describe('EntityStatuses', () => {
  test('parse accepts valid statuses', () => {
    expect(EntityStatuses.parse('draft')).toBe('draft');
    expect(EntityStatuses.parse('PUBLISHED')).toBe('published');
  });

  test('parse throws for invalid status', () => {
    expect(() => EntityStatuses.parse('invalid')).toThrow();
  });
});
