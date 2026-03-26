// STORY-032 — Note template extraction: branch template

import type { BaseEntityParams } from './leaf.ts';

export interface BranchParams extends BaseEntityParams {
  parent: string; // wiki link e.g. [[PROJ.ROOT - Title]]
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
