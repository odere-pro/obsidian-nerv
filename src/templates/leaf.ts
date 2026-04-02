import type { EntityStatus } from '../types/entity';

export interface BaseEntityParams {
  title: string;
  slug: string;
  project: string;
  kind: string;
  spine: string;
  status: EntityStatus;
  /** YYYY-MM-DD */
  created: string;
  /** YYYY-MM-DD */
  modified: string;
}

export interface LeafParams extends BaseEntityParams {
  /** Wiki link, e.g. `[[PROJ.ROOT - Title]]` */
  parent: string;
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
