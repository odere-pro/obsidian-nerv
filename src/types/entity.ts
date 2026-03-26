// STORY-031 — Bun CLI foundation: entity types

export type EntityType = 'LEAF' | 'BRANCH' | 'ROOT';

export type EntityStatus = 'draft' | 'review' | 'published' | 'archived';

export type EntityKind = string;

export interface NoteEntity {
  title: string;
  type: EntityType;
  kind: EntityKind;
  spine: string;
  status: EntityStatus;
  parent: string | null;
  children: string[];
  aliases: string[];
  attachments: string[];
  created: string; // ISO date string
  modified: string; // ISO date string
  tags: string[];
}
