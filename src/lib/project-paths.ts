/**
 * Canonical project path helpers.
 *
 * Centralises the `projects/<slug>/` convention so path construction
 * and slug extraction live in one place.
 */

/** Vault-relative directory for a project. */
export function projectDir(slug: string): string {
  return `projects/${slug}`;
}

/** Vault-relative path to the _ontology artifact. */
export function ontologyPath(slug: string): string {
  return `projects/${slug}/_ontology.${slug}.md`;
}

/** Vault-relative path to the _vocab artifact. */
export function vocabPath(slug: string): string {
  return `projects/${slug}/_vocab.${slug}.md`;
}

/** Vault-relative path to the _topk artifact. */
export function topkPath(slug: string): string {
  return `projects/${slug}/_topk.${slug}.md`;
}

/**
 * Vault-relative path for an entity note.
 *
 * @param project - Project slug (lowercase).
 * @param entitySlug - Entity slug (lowercase).
 * @param title - Human-readable title.
 */
export function entityNotePath(project: string, entitySlug: string, title: string): string {
  const prefix = project.toUpperCase();
  return `projects/${project}/${prefix}.${entitySlug} - ${title}.md`;
}

const PROJECT_SLUG_RE = /^projects\/([^/]+)\//;

/**
 * Extract the project slug from a vault-relative path.
 * Returns null if the path does not follow the `projects/<slug>/...` convention.
 */
export function projectSlugFromPath(path: string): string | null {
  const m = PROJECT_SLUG_RE.exec(path);
  return m ? m[1] : null;
}
