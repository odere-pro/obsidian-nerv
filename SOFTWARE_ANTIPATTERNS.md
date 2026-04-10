# Software Anti-Patterns Reference

---

### Design / Code

Anti-patterns in day-to-day code and class design that lead to maintenance problems.

#### God Object

One class does everything — holds most of the application's state and logic in a single, massive file.

- **Symptoms:** 1,000+ line class, dozens of methods spanning unrelated concerns, every module imports it.
- **Why it hurts:** Impossible to test in isolation, every change risks breaking unrelated features, merge conflicts are constant.
- **Fix:** Decompose by responsibility into focused classes (SRP).

#### Spaghetti Code

Tangled, unstructured control flow with no clear separation of concerns, deeply nested conditionals, and goto-like jumps.

- **Symptoms:** Functions hundreds of lines long, no clear entry/exit points, interleaved logic.
- **Why it hurts:** Cannot reason about behavior locally; every change requires understanding the entire flow.
- **Fix:** Extract methods, introduce control structures, apply structured programming principles.

#### Golden Hammer

Using one familiar tool or pattern for every problem regardless of fit — "when all you have is a hammer, everything looks like a nail."

- **Symptoms:** Every data problem is solved with a relational database, every communication is REST, every class uses the same design pattern.
- **Why it hurts:** Forces square pegs into round holes; missed opportunities for better solutions.
- **Fix:** Evaluate alternatives for each problem; choose based on fit, not familiarity.

#### Lava Flow

Dead or experimental code that nobody dares remove because nobody understands it or whether something still depends on it.

- **Symptoms:** Commented-out blocks, unused functions, "TODO: remove after migration" comments from years ago.
- **Why it hurts:** Increases cognitive load, confuses new developers, makes the codebase larger than necessary.
- **Fix:** Delete unused code (version control remembers). Use static analysis tools to find dead code.

#### Boat Anchor

Unused code, libraries, or infrastructure kept "just in case" it is needed someday.

- **Symptoms:** Imported but unused packages, feature flags for features that never shipped, abstracting for hypothetical future use.
- **Why it hurts:** Maintenance burden, confusion about what is real vs. speculative, increased build times.
- **Fix:** YAGNI (You Aren't Gonna Need It). Delete speculative code; re-implement if actually needed later.

#### Copy-Paste Programming

Duplicating code instead of abstracting it into a shared function or module.

- **Symptoms:** Nearly identical code blocks scattered across files, bug fixes applied in one copy but not others.
- **Why it hurts:** Bugs multiply — fixing one instance leaves others broken. Changes require updating N locations.
- **Fix:** Extract shared logic into functions, base classes, or utilities.

#### Magic Numbers/Strings

Unexplained literal values embedded directly in code with no name or context.

- **Symptoms:** `if (status === 3)`, `setTimeout(cb, 86400000)`, `path.join(base, '_inbox')`.
- **Why it hurts:** Unclear what the value means; easy to change one occurrence and miss others.
- **Fix:** Extract into named constants (`const MAX_RETRIES = 3`, `const ONE_DAY_MS = 86_400_000`).

#### Primitive Obsession

Using primitive types (strings, numbers, booleans) for domain concepts instead of dedicated types.

- **Symptoms:** Email addresses as strings, money as floats, relationship types as unvalidated strings.
- **Why it hurts:** No validation at construction, easy to mix up parameters, business rules scattered across consumers.
- **Fix:** Create value objects or branded types (`Email`, `Money`, `RelationType`).

#### Poltergeist

Short-lived classes that exist only to invoke methods on other classes, adding indirection with no value.

- **Symptoms:** A class with one method that just calls another class's method, "manager" or "coordinator" classes that do nothing themselves.
- **Why it hurts:** Increases complexity without adding behavior; makes the system harder to follow.
- **Fix:** Remove the intermediary and let the caller interact directly.

#### Circular Dependency

Two or more modules depend on each other, creating a cycle that makes the system fragile and hard to build or test.

- **Symptoms:** Import cycles, modules that cannot be loaded independently, build order issues.
- **Why it hurts:** Changes ripple in both directions, testing requires loading both modules, refactoring becomes dangerous.
- **Fix:** Extract shared code into a third module, use dependency inversion, or use events/callbacks to break the cycle.

---

### Architecture

Anti-patterns at the system and module level that undermine long-term viability.

#### Big Ball of Mud

A system with no discernible architecture — code is organized haphazardly with no boundaries between concerns.

- **Symptoms:** Any file can import any other file, business logic mixed with I/O, no module boundaries, "it works but nobody knows why."
- **Why it hurts:** Every change is risky, onboarding is painful, testing is nearly impossible.
- **Fix:** Incrementally introduce boundaries (modules, layers, ports) and enforce dependency rules.

#### Vendor Lock-In

Tight coupling to a specific platform, framework, or service provider that makes switching prohibitively expensive.

- **Symptoms:** Business logic interleaved with platform-specific API calls, no abstraction layer, data stored in proprietary formats.
- **Why it hurts:** Hostage to the vendor's pricing, roadmap, and uptime; migration costs compound over time.
- **Fix:** Abstract external dependencies behind interfaces (Ports & Adapters); use open standards where possible.

#### Reinventing the Wheel

Building custom implementations of functionality that already exists in well-tested libraries or frameworks.

- **Symptoms:** Custom HTTP client, custom date parsing, custom logging framework — all with bugs the standard library solved years ago.
- **Why it hurts:** Wastes development time, introduces bugs, and creates maintenance burden that standard libraries handle for free.
- **Fix:** Evaluate existing solutions before building. Wrap rather than rewrite.

#### Architecture by Implication

No explicit architecture decisions recorded — the system's structure is whatever happened to emerge.

- **Symptoms:** No ADRs (Architecture Decision Records), conflicting patterns in different parts of the codebase, new developers guessing the intended structure.
- **Why it hurts:** Inconsistency grows over time, design intent is lost, refactoring lacks a target state.
- **Fix:** Document architecture decisions (even briefly). Use ADRs. Draw boundary diagrams.

#### Stovepipe System

Isolated silos that cannot integrate — each subsystem has its own data model, technology, and communication style with no shared contracts.

- **Symptoms:** Duplicate data across systems, manual data re-entry, point-to-point integrations that break constantly.
- **Why it hurts:** Data inconsistency, high integration cost, teams cannot collaborate on cross-cutting features.
- **Fix:** Define shared interfaces and contracts, introduce integration layers, adopt common data formats.

---

### OOP-Specific

Anti-patterns that arise from misuse of object-oriented programming constructs.

#### Anemic Domain Model

Objects that have getters and setters but no behavior — business logic lives in separate "service" classes that manipulate the data.

- **Symptoms:** Model classes are just data bags, `UserService` does everything `User` should, domain objects have no methods.
- **Why it hurts:** Domain knowledge is scattered across services, invariants are not enforced at the object level, testing requires setting up service + model together.
- **Fix:** Move behavior into domain objects (Rich Domain Model). Enforce invariants in constructors and methods.

#### God Class / Blob

A single class with too many responsibilities that becomes the center of the system.

- **Symptoms:** 50+ methods, imports from dozens of modules, every change touches this class.
- **Why it hurts:** Same as God Object — untestable, merge-conflict magnet, cognitive overload.
- **Fix:** Extract cohesive subsets into dedicated classes.

#### Yo-Yo Problem

Deep, confusing inheritance chains where understanding a class requires bouncing up and down through many levels of hierarchy.

- **Symptoms:** 5+ levels of inheritance, methods overridden at multiple levels, behavior only understandable by reading the full chain.
- **Why it hurts:** Extreme cognitive load to understand any single class; fragile base class problem.
- **Fix:** Favor composition over inheritance. Flatten hierarchies. Use mixins or interfaces.

#### Refused Bequest

A subclass inherits from a parent but ignores or overrides most of the inherited behavior.

- **Symptoms:** Overridden methods that throw `NotImplementedError`, empty method bodies, `@Override` that does nothing.
- **Why it hurts:** Violates Liskov Substitution Principle; the inheritance relationship is a lie.
- **Fix:** Use composition instead, or restructure the hierarchy so the subclass only inherits what it actually uses.

#### Feature Envy

A method that uses data from another class more than from its own class.

- **Symptoms:** A method that calls 5+ getters on another object and performs logic on that data.
- **Why it hurts:** Logic is in the wrong place; the class holding the data should own the behavior.
- **Fix:** Move the method to the class whose data it uses, or extract a value object.

#### Inappropriate Intimacy

Two classes that know too much about each other's internal implementation details.

- **Symptoms:** Accessing private fields (even through reflection), deeply coupled method chains (`a.getB().getC().doThing()`).
- **Why it hurts:** Changes to one class's internals break the other. Tight coupling makes testing and refactoring costly.
- **Fix:** Apply Law of Demeter, introduce mediating interfaces, or merge classes that are too tightly coupled.

---

### Project / Management

Anti-patterns in project planning and team dynamics.

#### Analysis Paralysis

Over-analyzing a decision to the point where no progress is made — perfect becomes the enemy of good.

- **Symptoms:** Weeks of design discussions with no code written, requirement documents that grow endlessly, refusal to decide without complete information.
- **Why it hurts:** Progress stalls, morale drops, market windows close.
- **Fix:** Set decision deadlines, use spikes/prototypes to validate, embrace reversible decisions.

#### Death March

A project with unrealistic deadlines that everyone knows will fail, yet work continues under extreme pressure.

- **Symptoms:** Mandatory overtime, declining quality, high attrition, "we'll fix it after launch."
- **Why it hurts:** Burns out the team, produces low-quality software, creates technical debt that compounds.
- **Fix:** Renegotiate scope or timeline, prioritize ruthlessly, protect team sustainability.

#### Bikeshedding

Spending disproportionate time debating trivial details while ignoring important decisions.

- **Symptoms:** 50-comment PR review about naming conventions while architecture flaws go unreviewed, hour-long debates about code style.
- **Why it hurts:** Important decisions get insufficient attention; team energy is misallocated.
- **Fix:** Automate trivial decisions (linters, formatters), timebox discussions, focus reviews on behavior and design.

#### Mushroom Management

Keeping developers in the dark about business context, priorities, and decisions — "keep them in the dark and feed them manure."

- **Symptoms:** Developers receive tasks without context, no access to user feedback, surprised by priority changes.
- **Why it hurts:** Developers make worse decisions without context, feel demotivated, and cannot proactively solve problems.
- **Fix:** Share business context, include engineers in planning, provide access to user feedback and metrics.

#### Smoke and Mirrors

Demonstrating or selling non-existent functionality — "demo-driven development."

- **Symptoms:** Sales demos of hardcoded screens, investor pitches for unbuilt features, screenshots of mocked-up UIs.
- **Why it hurts:** Sets unrealistic expectations, creates pressure to cut corners, erodes trust when reality is revealed.
- **Fix:** Demo what exists, be transparent about timelines, use prototypes honestly.

---

### Testing

Anti-patterns that undermine the value of automated testing.

#### Ice Cream Cone

An inverted test pyramid — many manual/E2E/UI tests, few unit tests.

- **Symptoms:** Test suite takes hours, most coverage comes from Selenium/Playwright, failures are hard to diagnose.
- **Why it hurts:** Slow feedback loop, flaky tests, high maintenance cost, bugs found late.
- **Fix:** Invert the pyramid — more unit tests, fewer E2E tests. Test behavior at the lowest possible level.

#### Flaky Tests

Tests that non-deterministically pass or fail without code changes.

- **Symptoms:** "Re-run and it passes," tests that depend on timing, shared mutable state, or external services.
- **Why it hurts:** Erodes trust in the test suite, developers start ignoring failures, real bugs slip through.
- **Fix:** Isolate tests, use deterministic clocks/mocks, eliminate shared state between tests.

#### Testing Implementation Details

Tests tightly coupled to internal implementation rather than observable behavior.

- **Symptoms:** Tests assert on private method calls, specific function invocation order, or internal data structures.
- **Why it hurts:** Any refactoring breaks tests even when behavior is unchanged; tests become a maintenance burden rather than a safety net.
- **Fix:** Test public APIs and observable outcomes. Use contract tests. Assert on "what" not "how."

#### Slow Tests

A test suite that takes so long to run that developers stop running it regularly.

- **Symptoms:** CI takes 30+ minutes, developers push without running tests, "I'll run tests after the PR is up."
- **Why it hurts:** Feedback delay means bugs are found late, broken main branch, reduced confidence in changes.
- **Fix:** Parallelize tests, reduce I/O-bound tests, use test splitting, optimize setup/teardown.

---

### Concurrency

Anti-patterns in multi-threaded and parallel execution.

#### Race Condition

Two or more threads access shared mutable state without synchronization, leading to unpredictable behavior.

- **Symptoms:** Intermittent bugs, data corruption, test results that differ between runs.
- **Why it hurts:** Extremely hard to reproduce and debug; can cause data loss or security vulnerabilities.
- **Fix:** Use proper synchronization (locks, atomics), minimize shared mutable state, prefer message-passing.

#### Deadlock

Two or more threads each hold a resource and wait for the other to release, resulting in permanent blocking.

- **Symptoms:** Application hangs, threads blocked indefinitely, only discoverable via thread dumps.
- **Why it hurts:** Complete system freeze requiring restart; data loss if transactions are in-flight.
- **Fix:** Establish a consistent lock ordering, use timeout-based locking, reduce lock scope, prefer lock-free designs.

#### Busy Waiting

A thread continuously checks a condition in a tight loop, consuming CPU cycles while waiting.

- **Symptoms:** 100% CPU on idle threads, `while (!ready) {}` loops, polling without sleep.
- **Why it hurts:** Wastes CPU resources, can starve other threads, increases power consumption and heat.
- **Fix:** Use condition variables, semaphores, or event-based notification instead of spinning.

#### Thread Starvation

Some threads never get CPU time because other threads monopolize it or the thread pool is exhausted.

- **Symptoms:** Requests timing out, some operations never completing, uneven load across workers.
- **Why it hurts:** Partial system failure, degraded user experience, missed SLAs.
- **Fix:** Fair scheduling, separate thread pools for different priority work, avoid long-running tasks in shared pools.

---

### Database

Anti-patterns in data modeling and database access.

#### God Table

One table with dozens of unrelated columns, attempting to store everything in a single catch-all structure.

- **Symptoms:** 50+ columns, many nullable, column names like `field1`, `field2`, rows that use only a subset of columns.
- **Why it hurts:** No data integrity (everything is nullable), poor query performance, impossible to understand the schema.
- **Fix:** Normalize into focused tables, each representing a single entity or concept.

#### Inner-Platform Effect

Rebuilding database functionality (querying, indexing, permissions) inside the application rather than using the database's built-in capabilities.

- **Symptoms:** Application-level query language on top of the database, custom indexing logic, reimplemented transactions.
- **Why it hurts:** Always slower, buggier, and less optimized than the database engine. Massive maintenance burden.
- **Fix:** Use the database for what it does best. Leverage built-in indexing, query optimization, and transactional guarantees.

#### EAV Abuse (Entity-Attribute-Value)

Using an Entity-Attribute-Value schema where a traditional relational model would be clearer and more performant.

- **Symptoms:** `entity_id | attribute_name | attribute_value` pattern for everything, all values stored as strings, joins required to reconstruct a single entity.
- **Why it hurts:** No type safety, poor query performance, impossible to enforce constraints, reporting is painful.
- **When EAV is valid:** Truly dynamic schemas (user-defined custom fields with unknown attributes).
- **Fix:** Use proper relational modeling for known entities. Use JSONB columns for semi-structured data.

#### N+1 Query

Fetching a list of items and then executing a separate query for each item's related data, resulting in N+1 total queries.

- **Symptoms:** Page loads trigger hundreds of queries, each taking milliseconds but adding up to seconds; database logs show repetitive query patterns.
- **Why it hurts:** Linear query growth with data size; destroys performance at scale; unnecessary network round-trips.
- **Fix:** Use eager loading (JOIN), batch fetching (`WHERE id IN (...)`), or query result caching.
