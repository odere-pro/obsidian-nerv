import type { BaseEntityParams } from './leaf';

export interface BranchParams extends BaseEntityParams {
  /** Wiki link, e.g. `[[PROJ.ROOT - Title]]` */
  parent: string;
}

export function renderBranch(params: BranchParams): string {
  return `---
title: "${params.title}"
aliases: []
type: BRANCH
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
