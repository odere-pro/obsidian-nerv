import type { EntityStatus } from '../types/entity';

export interface RootParams {
  title: string;
  kind: string;
  spine: string;
  status: EntityStatus;
  created: string; // YYYY-MM-DD
  modified: string; // YYYY-MM-DD
}

export function renderRoot(params: RootParams): string {
  return `---
title: "${params.title}"
aliases: []
type: ROOT
kind: ${params.kind}
spine: ${params.spine}
status: ${params.status}
parent: ""
children: []
attachments: []
created: ${params.created}
modified: ${params.modified}
tags: []
---

## Summary

## Map

## Connections

## Flags
`;
}
