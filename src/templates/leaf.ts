import type { EntityStatus } from '../types/entity';

export interface BaseEntityParams {
  title: string;
  slug: string;
  project: string;
  kind: string;
  spine: string;
  status: EntityStatus;
  created: string; // YYYY-MM-DD
  modified: string; // YYYY-MM-DD
}

export interface LeafParams extends BaseEntityParams {
  parent: string; // wiki link e.g. [[PROJ.ROOT - Title]]
}

export function renderLeaf(params: LeafParams): string {
  return `---
title: "${params.title}"
aliases: []
type: LEAF
kind: ${params.kind}
spine: ${params.spine}
status: ${params.status}
parent: "${params.parent}"
children: []
attachments: []
created: ${params.created}
modified: ${params.modified}
tags: []
---

## Breadcrumb

## Summary

## Content

## Connections

## Flags
`;
}
