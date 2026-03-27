# Bases

**Bases** (Obsidian 1.9+) is a core plugin that turns any set of notes into a queryable database. Bases are stored as `.base` files using YAML syntax and are backed by Markdown frontmatter.

Enable at **Settings → Core plugins → Bases**.

---

## Create a base

| Method          | Action                                               |
| --------------- | ---------------------------------------------------- |
| Command Palette | "Bases: Create new base" or "Bases: Insert new base" |
| File Explorer   | Right-click a folder → New base                      |
| Ribbon          | Click the Create new base icon                       |

**Embed a base in a note**:

```markdown
![[MyBase.base]] ← first view by default
![[MyBase.base#ViewName]] ← specific named view
```

**Embed as a code block**:

````markdown
```base
filters:
  and:
    - file.hasTag("example")
views:
  - type: table
    name: Table
```
````

---

## File structure

A `.base` file has four top-level sections: `filters`, `formulas`, `properties`, and `views`.

```yaml
filters:
  or:
    - file.hasTag("book")
    - file.hasLink("Textbook")
formulas:
  reading_time: 'if(pages, (pages * 2).toString() + " min", "")'
properties:
  author:
    displayName: Author
  formula.reading_time:
    displayName: Est. Time
summaries:
  customAverage: 'values.mean().round(3)'
views:
  - type: table
    name: Reading List
    limit: 20
    groupBy:
      property: status
      direction: ASC
    filters:
      and:
        - 'status != "done"'
    order:
      - file.name
      - author
      - formula.reading_time
    summaries:
      formula.reading_time: Average
```

---

## Filters

By default, a base includes every file in the vault. Filters narrow results. They apply at two levels: **global** (all views) and **view-level** (one view only), concatenated with AND.

```yaml
# Single filter
filters: 'status == "done"'

# AND
filters:
  and:
    - 'status == "done"'
    - 'priority > 3'

# OR
filters:
  or:
    - file.hasTag("book")
    - file.hasTag("article")

# NOT
filters:
  not:
    - file.hasTag("archived")

# Nested
filters:
  or:
    - file.hasTag("active")
    - and:
        - file.inFolder("Projects")
        - 'status != "cancelled"'
```

---

## Formulas

Formulas define computed properties available across all views.

```yaml
formulas:
  total: 'price * quantity'
  status_icon: 'if(done, "✅", "⏳")'
  formatted_price: 'if(price, "$" + price.toFixed(2), "")'
  created: 'file.ctime.format("YYYY-MM-DD")'
  days_old: '(now() - file.ctime).days'
  days_until_due: 'if(due_date, (date(due_date) - today()).days, "")'
  overdue: 'if(due_date < now() && status != "Done", "Overdue", "")'
  last_updated: 'file.mtime.relative()'
  link_count: 'file.links.length'
  is_daily: '/^\d{4}-\d{2}-\d{2}$/.matches(file.name)'
  word_estimate: '(file.size / 5).round(0)'
```

**Property reference prefixes**:

| Prefix              | Resolves to          | Example                   |
| ------------------- | -------------------- | ------------------------- |
| _(none)_ or `note.` | Frontmatter property | `price`, `note.author`    |
| `file.`             | File system property | `file.name`, `file.mtime` |
| `formula.`          | Another formula      | `formula.formatted_price` |

Formulas may reference other formulas (no circular references). Wrap formulas containing double-quoted strings in single quotes. Access hyphenated property names with bracket notation: `note["release-date"]`.

---

## File properties

| Property          | Type   | Description                         |
| ----------------- | ------ | ----------------------------------- |
| `file.name`       | String | Filename without extension          |
| `file.path`       | String | Full file path                      |
| `file.folder`     | String | Parent folder path                  |
| `file.ext`        | String | File extension                      |
| `file.size`       | Number | Size in bytes                       |
| `file.ctime`      | Date   | Created time                        |
| `file.mtime`      | Date   | Modified time                       |
| `file.tags`       | List   | All tags (inline + frontmatter)     |
| `file.links`      | List   | All internal links                  |
| `file.backlinks`  | List   | Backlink files (slow; prefer links) |
| `file.embeds`     | List   | All embeds                          |
| `file.properties` | Object | All frontmatter properties          |

---

## The `this` object

`this` provides context-dependent access to the current file:

| Context                          | `this` refers to                           |
| -------------------------------- | ------------------------------------------ |
| Base opened in main content area | The base file itself                       |
| Base embedded in another note    | The embedding note                         |
| Base in a sidebar                | The currently active file in the main area |

**Sidebar backlinks pattern**:

```yaml
filters: file.hasLink(this.file)
views:
  - type: list
    name: Backlinks
```

---

## Views

| Type    | Description                                    | Available from |
| ------- | ---------------------------------------------- | -------------- |
| `table` | Rows and columns with properties as columns    | 1.9            |
| `cards` | Gallery grid with optional cover images        | 1.9            |
| `list`  | Bulleted or numbered list                      | 1.10           |
| `map`   | Pins on interactive map (requires Maps plugin) | 1.10           |

**View configuration keys**:

| Key         | Description                                   |
| ----------- | --------------------------------------------- |
| `type`      | View type: `table`, `cards`, `list`, `map`    |
| `name`      | Tab display name                              |
| `limit`     | Maximum number of results                     |
| `filters`   | View-specific filters (same syntax as global) |
| `groupBy`   | `property` and `direction` (`ASC` / `DESC`)   |
| `order`     | List of property names defining column order  |
| `summaries` | Maps property names to summary formula names  |

**Cards view additional settings**:

| Setting            | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `imageProperty`    | Property used as cover image (link, URL, or hex color) |
| Image fit          | `Cover` (fill, may crop) or `Contain` (no crop)        |
| Image aspect ratio | Default 1:1                                            |

**Map view configuration**:

```yaml
views:
  - type: map
    name: Locations
    lat: latitude
    long: longitude
    title: file.name
```

---

## Summaries

```yaml
summaries:
  customAverage: 'values.mean().round(3)'
```

**Built-in summary formulas**:

| Name      | Input type | Description           |
| --------- | ---------- | --------------------- |
| Average   | Number     | Mathematical mean     |
| Min       | Number     | Smallest number       |
| Max       | Number     | Largest number        |
| Sum       | Number     | Sum of all values     |
| Range     | Number     | Max − Min             |
| Median    | Number     | Mathematical median   |
| Stddev    | Number     | Standard deviation    |
| Earliest  | Date       | Earliest date         |
| Latest    | Date       | Latest date           |
| Range     | Date       | Latest − Earliest     |
| Checked   | Boolean    | Count of `true`       |
| Unchecked | Boolean    | Count of `false`      |
| Empty     | Any        | Count of empty values |
| Filled    | Any        | Count of non-empty    |
| Unique    | Any        | Count of unique       |

---

## Operators

**Arithmetic**: `+` `-` `*` `/` `%` `( )` — must be surrounded by spaces.

**Comparison**: `==` `!=` `>` `<` `>=` `<=`

**Boolean**: `!` `&&` `||`

**Date arithmetic**:

```yaml
filters: 'file.mtime > now() - "1 week"'
```

| Unit   | Aliases                  |
| ------ | ------------------------ |
| Year   | `y`, `year`, `years`     |
| Month  | `M`, `month`, `months`   |
| Week   | `w`, `week`, `weeks`     |
| Day    | `d`, `day`, `days`       |
| Hour   | `h`, `hour`, `hours`     |
| Minute | `m`, `minute`, `minutes` |
| Second | `s`, `second`, `seconds` |

---

## Functions reference

**Global functions**

| Function     | Signature                      | Description                              |
| ------------ | ------------------------------ | ---------------------------------------- |
| `date()`     | `date(string): date`           | Parse `"YYYY-MM-DD HH:mm:ss"` string     |
| `duration()` | `duration(string): duration`   | Parse duration string (e.g., `"1d"`)     |
| `if()`       | `if(cond, trueVal, falseVal?)` | Conditional; `falseVal` defaults to null |
| `now()`      | `now(): date`                  | Current date and time                    |
| `today()`    | `today(): date`                | Current date (time set to 00:00:00)      |
| `number()`   | `number(any): number`          | Convert to number                        |
| `list()`     | `list(element): List`          | Wrap element in a list                   |
| `link()`     | `link(path, display?): Link`   | Create a link                            |
| `image()`    | `image(path): image`           | Render image from path or URL            |
| `icon()`     | `icon(name): icon`             | Render a Lucide icon                     |
| `html()`     | `html(string): html`           | Render string as HTML                    |
| `max()`      | `max(n1, n2, ...): number`     | Largest of provided numbers              |
| `min()`      | `min(n1, n2, ...): number`     | Smallest of provided numbers             |

**String functions**

| Function                    | Description                        |
| --------------------------- | ---------------------------------- |
| `string.lower()`            | Convert to lowercase               |
| `string.title()`            | Convert to Title Case              |
| `string.trim()`             | Remove leading/trailing whitespace |
| `string.contains(value)`    | True if contains substring         |
| `string.startsWith(query)`  | True if starts with query          |
| `string.endsWith(query)`    | True if ends with query            |
| `string.replace(pat, repl)` | Replace occurrences                |
| `string.split(sep, n?)`     | Split into list; optional limit n  |
| `string.slice(start, end?)` | Substring from start to end        |
| `string.isEmpty()`          | True if empty or not present       |
| `string.length`             | Character count                    |

**Number functions**

| Function                | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `number.abs()`          | Absolute value                                       |
| `number.ceil()`         | Round up                                             |
| `number.floor()`        | Round down                                           |
| `number.round(digits?)` | Round to integer or n decimal places                 |
| `number.toFixed(n)`     | Fixed-point string (`3.14159.toFixed(2)` → `"3.14"`) |
| `number.isEmpty()`      | True if not present                                  |

**Date functions**

| Function                                                     | Description                                         |
| ------------------------------------------------------------ | --------------------------------------------------- |
| `date.format(fmt)`                                           | Format with Moment.js string (e.g., `"YYYY-MM-DD"`) |
| `date.relative()`                                            | Human-readable relative time (e.g., `"3 days ago"`) |
| `date.date()`                                                | Remove time portion                                 |
| `date.time()`                                                | Return time as string (e.g., `"23:59:59"`)          |
| `date.isEmpty()`                                             | Always returns `false`                              |
| `date.year`, `.month`, `.day`, `.hour`, `.minute`, `.second` | Date fields                                         |

**List functions**

| Function                  | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `list.contains(value)`    | True if list contains value                         |
| `list.filter(expr)`       | Filter elements; uses `value` and `index` variables |
| `list.map(expr)`          | Transform elements; uses `value` and `index`        |
| `list.reduce(expr, acc)`  | Reduce to single value                              |
| `list.sort()`             | Sort ascending                                      |
| `list.unique()`           | Remove duplicates                                   |
| `list.flat()`             | Flatten nested lists                                |
| `list.join(separator)`    | Join into string                                    |
| `list.reverse()`          | Reverse the list                                    |
| `list.slice(start, end?)` | Sublist                                             |
| `list.isEmpty()`          | True if empty                                       |
| `list.length`             | Item count                                          |

**File functions**

| Function                | Description                            |
| ----------------------- | -------------------------------------- |
| `file.hasTag(tag)`      | True if file has the tag               |
| `file.hasLink(target)`  | True if file contains a link to target |
| `file.inFolder(path)`   | True if file is in the folder          |
| `file.asLink(display?)` | Convert file to link                   |

**Regex functions**

```yaml
formulas:
  is_daily: '/^\d{4}-\d{2}-\d{2}$/.matches(file.name)'
```

| Function             | Description                      |
| -------------------- | -------------------------------- |
| `regex.matches(str)` | True if regex matches the string |
| `regex.test(str)`    | Alias for `matches()`            |

---

## Complete examples

**Reading list**:

```yaml
filters:
  or:
    - file.hasTag("book")
    - file.hasTag("article")
formulas:
  status_icon: 'if(status == "reading", "📖", if(status == "done", "✅", "📚"))'
  reading_time: 'if(pages, (pages * 2).toString() + " min", "")'
properties:
  author:
    displayName: Author
  formula.status_icon:
    displayName: ''
views:
  - type: cards
    name: Library
    order:
      - cover
      - file.name
      - author
      - formula.status_icon
  - type: table
    name: Reading Queue
    filters:
      and:
        - 'status == "to-read"'
    order:
      - file.name
      - author
      - pages
      - formula.reading_time
```

**Project tracker**:

```yaml
filters:
  and:
    - file.inFolder("Projects")
    - 'file.ext == "md"'
formulas:
  last_updated: 'file.mtime.relative()'
  link_count: 'file.links.length'
properties:
  formula.last_updated:
    displayName: Updated
  formula.link_count:
    displayName: Links
views:
  - type: table
    name: All Projects
    groupBy:
      property: status
      direction: ASC
    order:
      - file.name
      - status
      - formula.last_updated
      - formula.link_count
    summaries:
      formula.link_count: Average
```

**Daily notes dashboard**:

```yaml
filters:
  and:
    - file.inFolder("Daily Notes")
    - '/^\d{4}-\d{2}-\d{2}$/.matches(file.name)'
formulas:
  word_estimate: '(file.size / 5).round(0)'
  day_of_week: 'date(file.name).format("dddd")'
views:
  - type: table
    name: Recent Notes
    limit: 30
    order:
      - file.name
      - formula.day_of_week
      - formula.word_estimate
      - file.mtime
```

---

## Table view keyboard shortcuts

| Action               | macOS shortcut        |
| -------------------- | --------------------- |
| Copy cells           | `Cmd+C`               |
| Paste cells          | `Cmd+V`               |
| Undo                 | `Cmd+Z`               |
| Redo                 | `Cmd+Shift+Z`         |
| Select all in group  | `Cmd+A`               |
| Select in direction  | `Ctrl+Shift+Arrow`    |
| Focus / toggle cell  | `Enter`               |
| Next / previous cell | `Tab` / `Shift+Tab`   |
| First / last column  | `Home` / `End`        |
| Page up / down       | `PageUp` / `PageDown` |
| Clear selection      | `Esc`                 |
| Clear cell contents  | `Backspace`           |

---

## Export options

- **Copy to clipboard** — paste into Markdown or spreadsheet apps (Google Sheets, Excel, Numbers).
- **Export CSV** — save as `.csv` from the Results menu in the toolbar.
