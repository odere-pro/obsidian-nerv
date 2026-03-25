# Obsidian Skills Documentation

_For: developers and AI agents working with Obsidian vaults._

Agent Skills for Obsidian — a collection of standardized skill definitions that allow AI agents to programmatically interact with Obsidian vault files. Each skill follows the [Agent Skills specification](https://agentskills.io/specification) and is compatible with Claude Code, Codex CLI, and OpenCode.

**Repository:** [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) · 17.1k stars · MIT license

---

## Table of Contents

1. [Skills Overview](#skills-overview)
2. [Installation](#installation)
3. [Obsidian Markdown Skill](#obsidian-markdown-skill)
4. [Obsidian Bases Skill](#obsidian-bases-skill)
   - [File Structure](#bases-file-structure)
   - [Views](#views)
   - [Filters](#filters)
   - [Formulas and Properties](#formulas-and-properties)
   - [Functions Reference](#functions-reference)
   - [Summaries](#summaries)
5. [JSON Canvas Skill](#json-canvas-skill)
6. [Obsidian CLI Skill](#obsidian-cli-skill)
7. [Defuddle Skill](#defuddle-skill)

---

## Skills Overview

| Skill               | File type | Primary use                                           |
| ------------------- | --------- | ----------------------------------------------------- |
| `obsidian-markdown` | `.md`     | Notes, documents, wikis with Obsidian-specific syntax |
| `obsidian-bases`    | `.base`   | Database-like views of vault notes                    |
| `json-canvas`       | `.canvas` | Visual diagrams, mind maps, flowcharts                |
| `obsidian-cli`      | —         | Vault and plugin management via CLI                   |
| `defuddle`          | —         | Web-to-Markdown extraction, token optimization        |

---

## Installation

### Marketplace (Claude Code)

```
/plugin marketplace add kepano/obsidian-skills
/plugin install obsidian@obsidian-skills
```

### NPX

```bash
npx skills add git@github.com:kepano/obsidian-skills.git
```

### Manual — Claude Code

Add the repository contents to a `/.claude` folder in the root of your Obsidian vault.

### Manual — Codex CLI

Copy the `skills/` directory into `~/.codex/skills`.

### Manual — OpenCode

Clone the full repo into `~/.opencode/skills/obsidian-skills/`. Do **not** copy only the inner `skills/` folder — the full directory structure must be `~/.opencode/skills/obsidian-skills/skills/<skill-name>/SKILL.md`. OpenCode auto-discovers all `SKILL.md` files; no config changes are needed.

---

## Obsidian Markdown Skill

**Skill name:** `obsidian-markdown` · **File extension:** `.md`

Enables AI agents to create and edit Obsidian Flavored Markdown files. Obsidian Flavored Markdown is a superset combining CommonMark, GitHub Flavored Markdown (GFM), LaTeX, and Obsidian-specific extensions.

**Activate when:** working with `.md` files, or when the user mentions wikilinks, callouts, embeds, frontmatter, tags, or properties.

### Feature Categories

| Category        | Features                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base formatting | Paragraphs, headings, bold, italic, lists, quotes, code blocks, tables                                                                                                    |
| Linking         | Standard links, `[[wikilinks]]`, heading links `[[Note#Heading]]`, block links `[[Note#^block-id]]`                                                                       |
| Embedding       | Notes, sections, images, PDFs via `![[filename]]` transclusion                                                                                                            |
| Callouts        | 13+ built-in types (`note`, `tip`, `warning`, `info`, `example`, `quote`, `bug`, `danger`, `success`, `failure`, `question`, `abstract`, `todo`), foldable, custom titles |
| Metadata        | YAML frontmatter properties, inline `#tags`                                                                                                                               |
| Math            | Inline `$...$` and block `$$...$$` via LaTeX                                                                                                                              |
| Diagrams        | Flowcharts and sequence diagrams via Mermaid code blocks                                                                                                                  |
| Advanced        | Footnotes `[^1]`, hidden comments `%%...%%`, highlighting `==text==`, block IDs `^block-id`                                                                               |

### Key Syntax Examples

```markdown
---
title: 'My Note'
date: 2026-03-25
tags: [project, active]
status: in-progress
---

# My Note

Link to another note: [[Related Note]]
Link to a section: [[Related Note#Summary]]

![[image.png|300]]
![[document.pdf#page=2]]

> [!warning] Watch out
> This is a foldable warning callout.

$$E = mc^2$$
```

---

## Obsidian Bases Skill

**Skill name:** `obsidian-bases` · **File extension:** `.base` · **Format:** YAML

Enables AI agents to create database-like views of vault notes. A `.base` file defines one or more views that query all notes in the vault, with support for filters, formulas, property display configuration, and aggregation summaries.

**Activate when:** the user asks for database views, filtered note lists, computed properties, aggregations, or mentions "Bases", "table view", "card view", "filters", or "formulas" in an Obsidian context.

### Bases File Structure

A `.base` file is a YAML document with five optional top-level keys. Only `views` is required.

```yaml
# Narrows which notes appear in ALL views
filters:
  and: []
  or: []
  not: []

# Computed properties available across all views
formulas:
  formula_name: 'expression'

# Display name overrides for properties, file metadata, and formulas
properties:
  property_name:
    displayName: 'Display Name'
  formula.formula_name:
    displayName: 'Formula Display Name'
  file.ext:
    displayName: 'Extension'

# Custom aggregation formulas for summary rows
summaries:
  custom_summary_name: 'values.mean().round(3)'

# One or more view definitions
views:
  - type: table | cards | list | map
    name: 'View Name'
    limit: 10 # Optional
    groupBy: # Optional
      property: property_name
      direction: ASC | DESC
    filters: # View-specific (ANDed with global filters)
      and: []
    order: # Properties to display, in order
      - file.name
      - property_name
      - formula.formula_name
    summaries: # Map properties to summary formulas
      property_name: Average
```

#### Minimal valid base file

```yaml
views:
  - type: table
    name: 'All Notes'
    order:
      - file.name
```

#### Processing pipeline

1. Global `filters` narrow the vault to a shared note set.
2. `formulas` compute derived values.
3. View-specific `filters` further narrow results (ANDed with global filters).
4. `groupBy` and `limit` organize the result set.
5. `summaries` aggregate column data.
6. The view is rendered inside Obsidian.

#### YAML quoting rules

| Case                                   | Quote style             | Example                            |
| -------------------------------------- | ----------------------- | ---------------------------------- |
| Formulas containing double quotes      | Single quotes           | `'if(done, "Yes", "No")'`          |
| Simple string values                   | Double quotes           | `"My View Name"`                   |
| Complex expressions with nested quotes | Single quotes           | `'status.contains("in-progress")'` |
| Filter expressions                     | Single or double quotes | `'status == "active"'`             |

#### Embedding a base in a Markdown note

```markdown
![[MyBase.base]] <!-- all views -->
![[MyBase.base#View Name]] <!-- specific view -->
```

When embedded, the `this` keyword in formulas and filters refers to the **embedding note**, not the `.base` file. This enables context-aware dashboards.

---

### Views

Each entry in the `views` array defines one visual presentation.

#### View schema

| Key         | Type     | Required | Description                                                  |
| ----------- | -------- | -------- | ------------------------------------------------------------ |
| `type`      | string   | Yes      | `table`, `cards`, `list`, or `map`                           |
| `name`      | string   | Yes      | Display name                                                 |
| `limit`     | number   | No       | Maximum results to display                                   |
| `groupBy`   | object   | No       | Group by a property (`property` + `direction: ASC\|DESC`)    |
| `filters`   | object   | No       | View-specific filters (combined with global filters via AND) |
| `order`     | string[] | Yes      | Properties to display as columns/fields, in sequence         |
| `summaries` | object   | No       | Map property names to summary formula names                  |

#### View types

**`table`** — Spreadsheet-style with sortable columns. Each property in `order` becomes a column.

```yaml
views:
  - type: table
    name: 'Active Tasks'
    order:
      - file.name
      - status
      - due_date
    summaries:
      price: Sum
```

**`cards`** — Gallery layout. The first property in `order` is typically the primary visual element (e.g., a cover image).

```yaml
views:
  - type: cards
    name: 'Gallery'
    order:
      - cover
      - file.name
      - author
```

**`list`** — Minimal vertical list. Lightweight, good for sidebars and mobile.

```yaml
views:
  - type: list
    name: 'Simple List'
    order:
      - file.name
      - status
```

**`map`** — Geographic view. Requires notes with latitude/longitude properties.

```yaml
views:
  - type: map
    name: 'Locations'
    order:
      - file.name
      - location
```

#### Complete view example

```yaml
views:
  - type: table
    name: 'Active Tasks'
    filters:
      and:
        - 'status != "done"'
    order:
      - file.name
      - status
      - formula.priority_label
      - due
      - formula.days_until_due
    groupBy:
      property: status
      direction: ASC
    summaries:
      formula.days_until_due: Average
```

---

### Filters

Filters are condition expressions that narrow which notes appear in a view.

#### Filter locations

| Scope         | YAML key                  | Applies to            |
| ------------- | ------------------------- | --------------------- |
| Global        | Top-level `filters:`      | All views in the base |
| View-specific | Inside `views[].filters:` | That view only        |

When both exist, a note must pass **both** the global filter and the view filter to appear.

#### Filter structure

**Simple string filter** — a single condition:

```yaml
filters: 'status == "done"'
```

**Recursive filter object** — logical operators containing arrays of expressions or nested objects:

```yaml
filters:
  and:
    - 'status == "done"'
    - 'priority > 3'
```

#### Logical operators

| Operator | Behaviour                             |
| -------- | ------------------------------------- |
| `and`    | All conditions must be true           |
| `or`     | At least one condition must be true   |
| `not`    | Excludes notes matching any condition |

```yaml
# and
filters:
  and:
    - 'status == "done"'
    - 'priority > 3'

# or
filters:
  or:
    - 'file.hasTag("book")'
    - 'file.hasTag("article")'

# not
filters:
  not:
    - 'file.hasTag("archived")'
```

#### Nested filter example

```yaml
filters:
  or:
    - file.hasTag("tag")
    - and:
        - file.hasTag("book")
        - file.hasLink("Textbook")
    - not:
        - file.hasTag("book")
        - file.inFolder("Required Reading")
```

#### Comparison operators

| Operator | Meaning              | Example                                        |
| -------- | -------------------- | ---------------------------------------------- |
| `==`     | Equals               | `'status == "done"'`                           |
| `!=`     | Not equal            | `'status != "todo"'`                           |
| `>`      | Greater than         | `'priority > 3'`                               |
| `<`      | Less than            | `'priority < 5'`                               |
| `>=`     | Greater or equal     | `'priority >= 3'`                              |
| `<=`     | Less or equal        | `'priority <= 5'`                              |
| `&&`     | Logical AND (inline) | `'priority > 3 && status == "done"'`           |
| `\|\|`   | Logical OR (inline)  | `'status == "done" \|\| status == "archived"'` |
| `!`      | Logical NOT (inline) | `'!file.hasTag("draft")'`                      |

#### Property namespaces in filters

| Namespace                     | Access                                  | Example                       |
| ----------------------------- | --------------------------------------- | ----------------------------- |
| Note properties (frontmatter) | `property_name` or `note.property_name` | `'author == "Jane"'`          |
| File metadata                 | `file.property`                         | `'file.folder == "projects"'` |
| Formula properties            | `formula.formula_name`                  | `'formula.days_old > 30'`     |

#### File metadata available in filters

| Property      | Type   | Description              |
| ------------- | ------ | ------------------------ |
| `file.name`   | String | File name with extension |
| `file.path`   | String | Full vault-relative path |
| `file.folder` | String | Parent folder path       |
| `file.tags`   | List   | All tags in the file     |
| `file.ctime`  | Date   | Creation timestamp       |
| `file.mtime`  | Date   | Modification timestamp   |

#### Filter functions

| Function          | Signature                 | Description                            |
| ----------------- | ------------------------- | -------------------------------------- |
| `date()`          | `date(string)`            | Parse string to date                   |
| `now()`           | `now()`                   | Current date and time                  |
| `today()`         | `today()`                 | Current date at midnight               |
| `if()`            | `if(cond, t, f)`          | Conditional logic                      |
| `file()`          | `file(path)`              | Get file object by path                |
| `file.hasTag()`   | `file.hasTag(...tags)`    | True if file has any of the tags       |
| `file.hasLink()`  | `file.hasLink(otherFile)` | True if file links to target           |
| `file.inFolder()` | `file.inFolder(folder)`   | True if file is in folder or subfolder |

---

### Formulas and Properties

Formulas define computed values available across all views. They are referenced with the `formula.` prefix.

#### Three property types

| Type                          | Access pattern                          | Example                                |
| ----------------------------- | --------------------------------------- | -------------------------------------- |
| Note properties (frontmatter) | `property_name` or `note.property_name` | `author`, `note.status`                |
| File metadata                 | `file.property`                         | `file.name`, `file.ctime`, `file.size` |
| Formula properties            | `formula.formula_name`                  | `formula.days_old`                     |

#### Full file metadata reference

| Property          | Type   | Description                  |
| ----------------- | ------ | ---------------------------- |
| `file.name`       | String | File name with extension     |
| `file.basename`   | String | File name without extension  |
| `file.path`       | String | Full vault-relative path     |
| `file.folder`     | String | Parent folder path           |
| `file.ext`        | String | File extension               |
| `file.size`       | Number | File size in bytes           |
| `file.ctime`      | Date   | Creation timestamp           |
| `file.mtime`      | Date   | Modification timestamp       |
| `file.tags`       | List   | All tags including inline    |
| `file.links`      | List   | Internal wikilinks in file   |
| `file.backlinks`  | List   | Files that link to this file |
| `file.embeds`     | List   | Embedded files               |
| `file.properties` | Object | All frontmatter as an object |

#### Formula definition

```yaml
formulas:
  # Arithmetic
  total: 'price * quantity'

  # Conditional logic
  status_icon: 'if(done, "✅", "⏳")'

  # String operations
  formatted_price: 'if(price, price.toFixed(2) + " dollars", "")'

  # Date calculations
  created: 'file.ctime.format("YYYY-MM-DD")'

  # Duration (access a field THEN apply math functions)
  days_until_due: 'if(due_date, (date(due_date) - today()).days, "")'
```

#### Duration handling — critical rule

When subtracting two dates, the result is a `Duration` type. Duration does **not** support `.round()`, `.floor()`, or `.ceil()` directly. You must access a numeric field first.

```yaml
# CORRECT — access .days field first, then round
days_old: '(now() - file.ctime).days.round(0)'

# WRONG — applying round() directly to a Duration
days_old: '(now() - file.ctime).round(0)'
```

Duration fields: `.days`, `.hours`, `.minutes`, `.seconds`, `.milliseconds`

#### Date arithmetic

```yaml
formulas:
  tomorrow: 'now() + "1 day"'
  next_week: 'today() + "7d"'
  last_month: 'now() - "1 month"'
```

#### Operators

| Category         | Operators                        |
| ---------------- | -------------------------------- |
| Arithmetic       | `+`, `-`, `*`, `/`, `%`          |
| Comparison       | `==`, `!=`, `>`, `<`, `>=`, `<=` |
| Logical (inline) | `&&`, `\|\|`, `!`                |

#### Property display configuration

```yaml
properties:
  status:
    displayName: 'Task Status'
  file.ext:
    displayName: 'Extension'
  formula.days_until_due:
    displayName: 'Days Until Due'
```

#### The `this` keyword

| Context            | `this` refers to                         |
| ------------------ | ---------------------------------------- |
| Main content area  | The `.base` file itself                  |
| Embedded in a note | The embedding note                       |
| Sidebar view       | The active file in the main content area |

---

### Functions Reference

Functions are available in formulas, filter expressions, and custom summaries.

#### Global functions

| Function       | Signature                                      | Description                                          |
| -------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `date()`       | `date(string): date`                           | Parse string to date (format: `YYYY-MM-DD HH:mm:ss`) |
| `duration()`   | `duration(string): duration`                   | Parse duration string                                |
| `now()`        | `now(): date`                                  | Current date and time                                |
| `today()`      | `today(): date`                                | Current date (time = 00:00:00)                       |
| `if()`         | `if(condition, trueResult, falseResult?): any` | Conditional                                          |
| `min()`        | `min(n1, n2, ...): number`                     | Smallest number                                      |
| `max()`        | `max(n1, n2, ...): number`                     | Largest number                                       |
| `number()`     | `number(any): number`                          | Convert to number                                    |
| `link()`       | `link(path, display?): Link`                   | Create a link                                        |
| `list()`       | `list(element): List`                          | Wrap in list if not already                          |
| `file()`       | `file(path): file`                             | Get file object                                      |
| `image()`      | `image(path): image`                           | Create image for rendering                           |
| `icon()`       | `icon(name): icon`                             | Lucide icon by name                                  |
| `html()`       | `html(string): html`                           | Render as HTML                                       |
| `escapeHTML()` | `escapeHTML(string): string`                   | Escape HTML characters                               |

#### Any type methods

| Method       | Signature                   | Description                               |
| ------------ | --------------------------- | ----------------------------------------- |
| `isTruthy()` | `any.isTruthy(): boolean`   | Coerce to boolean                         |
| `isType()`   | `any.isType(type): boolean` | Check type (`"number"`, `"string"`, etc.) |
| `toString()` | `any.toString(): string`    | Convert to string                         |

#### Date methods

Fields: `date.year`, `date.month`, `date.day`, `date.hour`, `date.minute`, `date.second`, `date.millisecond`

| Method                 | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `date.date()`          | Remove time portion                               |
| `date.format(pattern)` | Format with Moment.js pattern                     |
| `date.time()`          | Get time as string                                |
| `date.relative()`      | Human-readable relative time (e.g., "3 days ago") |

#### String methods

Field: `string.length`

| Method         | Signature                                      | Description         |
| -------------- | ---------------------------------------------- | ------------------- |
| `contains()`   | `string.contains(value): boolean`              | Check for substring |
| `startsWith()` | `string.startsWith(query): boolean`            | Starts with query   |
| `lower()`      | `string.lower(): string`                       | To lowercase        |
| `replace()`    | `string.replace(pattern, replacement): string` | Replace pattern     |
| `split()`      | `string.split(separator, n?): list`            | Split to list       |
| `slice()`      | `string.slice(start, end?): string`            | Substring           |

#### Number methods

| Method                      | Description                 |
| --------------------------- | --------------------------- |
| `number.abs()`              | Absolute value              |
| `number.ceil()`             | Round up                    |
| `number.floor()`            | Round down                  |
| `number.round(digits?)`     | Round to digits             |
| `number.toFixed(precision)` | Fixed-point notation string |

#### List methods

Field: `list.length`

| Method     | Signature                               | Description                                 |
| ---------- | --------------------------------------- | ------------------------------------------- |
| `filter()` | `list.filter(expression): list`         | Filter by condition (uses `value`, `index`) |
| `map()`    | `list.map(expression): list`            | Transform elements (uses `value`, `index`)  |
| `reduce()` | `list.reduce(expression, initial): any` | Reduce (uses `value`, `index`, `acc`)       |
| `join()`   | `list.join(separator): string`          | Join to string                              |
| `unique()` | `list.unique(): list`                   | Remove duplicates                           |
| `sort()`   | `list.sort(): list`                     | Sort ascending                              |
| `flat()`   | `list.flat(): list`                     | Flatten nested lists                        |
| `some()`   | `list.some(expression): boolean`        | True if any element matches                 |

#### File methods

| Method       | Signature                          | Description            |
| ------------ | ---------------------------------- | ---------------------- |
| `asLink()`   | `file.asLink(display?): Link`      | Convert to link        |
| `hasLink()`  | `file.hasLink(otherFile): boolean` | Has link to file       |
| `hasTag()`   | `file.hasTag(...tags): boolean`    | Has any of the tags    |
| `inFolder()` | `file.inFolder(folder): boolean`   | In folder or subfolder |

#### Link methods

| Method               | Description                          |
| -------------------- | ------------------------------------ |
| `link.asFile()`      | Get the file object                  |
| `link.linksTo(file)` | True if this link points to the file |

#### Object methods

| Method            | Description    |
| ----------------- | -------------- |
| `object.keys()`   | List of keys   |
| `object.values()` | List of values |

#### Regular expression method

| Method                   | Description                         |
| ------------------------ | ----------------------------------- |
| `regexp.matches(string)` | Test whether string matches pattern |

---

### Summaries

Summaries aggregate property values across all rows in a view, appearing as a footer row in tables.

#### Summary structure

```yaml
# Global custom summaries (defined at base level)
summaries:
  avgLinks: 'values.filter(value.isType("number")).mean().round(1)'

# Applied inside a view
views:
  - type: table
    name: 'Task Overview'
    order:
      - estimated_hours
      - priority
      - formula.link_count
    summaries:
      estimated_hours: Sum # Built-in
      priority: Average # Built-in
      formula.link_count: avgLinks # Custom (references global definition)
```

#### Default summary formulas

**Number**

| Name      | Description        |
| --------- | ------------------ |
| `Average` | Mathematical mean  |
| `Min`     | Smallest value     |
| `Max`     | Largest value      |
| `Sum`     | Sum of all values  |
| `Range`   | Max − Min          |
| `Median`  | Median value       |
| `Stddev`  | Standard deviation |

**Date**

| Name       | Description                            |
| ---------- | -------------------------------------- |
| `Earliest` | Earliest date                          |
| `Latest`   | Latest date                            |
| `Range`    | Latest − Earliest (returns a duration) |

**Boolean**

| Name        | Description             |
| ----------- | ----------------------- |
| `Checked`   | Count of `true` values  |
| `Unchecked` | Count of `false` values |

**Universal (any type)**

| Name     | Description               |
| -------- | ------------------------- |
| `Empty`  | Count of empty values     |
| `Filled` | Count of non-empty values |
| `Unique` | Count of unique values    |

#### Type compatibility

| Property type | Compatible summaries                                                 |
| ------------- | -------------------------------------------------------------------- |
| Number        | Average, Min, Max, Sum, Range, Median, Stddev, Empty, Filled, Unique |
| Date          | Earliest, Latest, Range, Empty, Filled, Unique                       |
| Boolean       | Checked, Unchecked, Empty, Filled                                    |
| String        | Empty, Filled, Unique                                                |
| List          | Empty, Filled, Unique                                                |

#### Custom summary examples

```yaml
summaries:
  # Average with precision control
  avgLinks: 'values.filter(value.isType("number")).mean().round(1)'

  # Count with condition
  activeCount: 'values.filter(value == "active").length'

  # Completion rate percentage
  completionRate: '(values.filter(value.isTruthy()).length / values.length * 100).round(1)'

  # Reduce to total
  totalHours: 'values.filter(value.isType("number")).reduce(acc + value, 0).round(2)'

  # Unique tag aggregation
  allTags: 'values.flat().unique().sort().join(", ")'
```

#### Best practices

- Prefer built-in summaries — they handle null values automatically.
- Filter for type safety in custom numeric summaries: `values.filter(value.isType("number"))`.
- For duration summaries, access `.days` (or similar) before applying `round()`.
- Guard against division by zero: `if(values.length > 0, values.sum() / values.length, 0)`.

---

## JSON Canvas Skill

**Skill name:** `json-canvas` · **File extension:** `.canvas` · **Format:** JSON

Enables AI agents to create visual canvases containing nodes and edges, conforming to the [JSON Canvas Specification 1.0](https://jsoncanvas.org/spec/1.0/). Use for mind maps, flowcharts, and spatial content arrangements.

**Activate when:** working with `.canvas` files, or when the user requests visual canvases, mind maps, or flowcharts.

### Canvas file structure

```json
{
  "nodes": [],
  "edges": []
}
```

- `nodes` — array order determines z-index; last item renders on top.
- `edges` — define connections between nodes.

### Node types

Every node requires: `id` (16-character lowercase hex), `type`, `x`, `y`, `width`, `height`.

#### Text node

```json
{
  "id": "6f0ad84f44ce9c17",
  "type": "text",
  "text": "# Heading\nMarkdown content here.",
  "x": 0,
  "y": 0,
  "width": 400,
  "height": 200
}
```

#### File node

```json
{
  "id": "a1b2c3d4e5f60001",
  "type": "file",
  "file": "path/to/note.md",
  "subpath": "#Section",
  "x": 500,
  "y": 0,
  "width": 400,
  "height": 200
}
```

#### Link node

```json
{
  "id": "a1b2c3d4e5f60002",
  "type": "link",
  "url": "https://example.com",
  "x": 1000,
  "y": 0,
  "width": 400,
  "height": 200
}
```

#### Group node

```json
{
  "id": "a1b2c3d4e5f60003",
  "type": "group",
  "label": "My Group",
  "background": "path/to/bg.png",
  "x": -50,
  "y": -50,
  "width": 600,
  "height": 400
}
```

### Edges

```json
{
  "id": "edge0000000000001",
  "fromNode": "6f0ad84f44ce9c17",
  "fromSide": "right",
  "toNode": "a1b2c3d4e5f60001",
  "toSide": "left",
  "fromEnd": "none",
  "toEnd": "arrow",
  "label": "Optional edge label"
}
```

- `fromSide` / `toSide`: `top`, `right`, `bottom`, `left`
- `fromEnd` / `toEnd`: `none`, `arrow`

### Layout and styling

- Coordinate system: `x` increases rightward, `y` increases downward.
- Recommended node spacing: 50–100 px apart.
- Recommended size for medium text: 400 × 200 px.
- **Colors:** hex string (e.g., `"#FF0000"`) or preset number `"1"`–`"6"` (Red, Orange, Yellow, Green, Cyan, Purple).
- **IDs:** must be unique 16-character lowercase hexadecimal strings (e.g., `"6f0ad84f44ce9c17"`).

---

## Obsidian CLI Skill

**Skill name:** `obsidian-cli`

Provides a command-line interface for interacting with a running Obsidian instance. Requires Obsidian to be open and active. Enables vault operations, note management, and plugin/theme development workflows.

**Activate when:** the user asks to interact with Obsidian via CLI, manage plugins, reload themes, or debug the app.

### Command syntax

Parameters use `=` assignment; flags are boolean switches.

```bash
obsidian create name="My Note"
obsidian read file="My Note"
obsidian append file="My Note" content="New paragraph"
```

File targeting: use `file` (wikilink style) or `path` (absolute vault path).

### Note operations

| Operation        | Example                                          |
| ---------------- | ------------------------------------------------ |
| Read a note      | `obsidian read file="Note Name"`                 |
| Create a note    | `obsidian create name="Note Name"`               |
| Append to a note | `obsidian append file="Note Name" content="..."` |
| Search vault     | `obsidian search query="keyword"`                |
| List tags        | `obsidian tags`                                  |
| List backlinks   | `obsidian backlinks file="Note Name"`            |

### Developer tools

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `obsidian plugin:reload` | Hot-reload a plugin after code changes                   |
| `obsidian dev:errors`    | Capture console errors in the terminal                   |
| `obsidian dev:console`   | Stream console output to the terminal                    |
| `obsidian dev:dom`       | Inspect the Obsidian DOM                                 |
| `obsidian eval`          | Execute arbitrary JavaScript in the Obsidian app context |

---

## Defuddle Skill

**Skill name:** `defuddle`

Extracts clean, readable Markdown from web pages by removing navigation, ads, footers, and other clutter. Preferred over raw WebFetch when processing human-readable content — significantly reduces token usage.

**Activate when:** the user provides a URL and asks for its content to be read, summarized, or saved.

### Core command

```bash
defuddle parse <url> --md
```

### Output formats

| Flag            | Output                                                |
| --------------- | ----------------------------------------------------- |
| `--md`          | Clean Markdown                                        |
| `--json`        | Structured JSON with metadata                         |
| `-p title`      | Specific property only (e.g., `title`, `description`) |
| `-o content.md` | Save output to file                                   |

### Examples

```bash
# Parse to Markdown
defuddle parse https://example.com/article --md

# Save to file
defuddle parse https://example.com/article --md -o notes/article.md

# Extract just the title
defuddle parse https://example.com/article -p title

# Get structured JSON
defuddle parse https://example.com/article --json
```

### Defuddle vs. WebFetch

| Tool             | When to use                                                                           |
| ---------------- | ------------------------------------------------------------------------------------- |
| `defuddle parse` | Human-readable articles, blog posts, documentation — strips clutter, optimizes tokens |
| `WebFetch`       | Raw HTML debugging, scraping data that Defuddle might filter out                      |

### Installation

```bash
npm install -g defuddle
```
