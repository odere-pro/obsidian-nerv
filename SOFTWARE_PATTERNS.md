# Software Patterns Reference

---

### Creational — Object/Instance Creation

Patterns that abstract the instantiation process, making systems independent of how objects are created, composed, and represented.

#### Singleton

Ensures a class has exactly one instance and provides a global access point to it.

- **Use when:** A single shared resource (config, logger, connection pool) must be coordinated across the system.
- **Structure:** Private constructor, static instance field, static `getInstance()` method.
- **Trade-offs:** Simple to implement but introduces global state, hinders testability, and hides dependencies. Thread-safety requires extra care in concurrent environments.
- **Example:** Database connection pool shared across all request handlers.

#### Factory Method

Defines an interface for creating objects but lets subclasses decide which class to instantiate.

- **Use when:** A class cannot anticipate the type of objects it needs to create, or you want subclasses to specify created objects.
- **Structure:** Abstract creator with `createProduct()` method; concrete creators override it to return specific product types.
- **Trade-offs:** Decouples client code from concrete classes. Adds a parallel hierarchy of creators alongside products.
- **Example:** A `DocumentFactory` where `PdfFactory` and `HtmlFactory` each produce their respective document types.

#### Abstract Factory

Provides an interface for creating families of related objects without specifying their concrete classes.

- **Use when:** A system must work with multiple families of products (e.g., UI themes, platform-specific widgets) and you want to enforce consistency within a family.
- **Structure:** Abstract factory interface with methods for each product type; concrete factories implement the full family.
- **Trade-offs:** Enforces product family consistency. Adding a new product type requires changing all factory implementations.
- **Example:** `DarkThemeFactory` produces `DarkButton`, `DarkTextField`, `DarkPanel` while `LightThemeFactory` produces the light equivalents.

#### Builder

Separates the construction of a complex object from its representation, allowing the same construction process to create different representations.

- **Use when:** An object requires many optional parameters, or the construction process must allow different representations.
- **Structure:** Builder interface with step methods (`setX()`, `setY()`); Director orchestrates the build sequence; `build()` returns the final product.
- **Trade-offs:** Eliminates telescoping constructors. Clear, readable construction. Adds extra classes.
- **Example:** `QueryBuilder().select('name').from('users').where('active = true').limit(10).build()`.

#### Prototype

Creates new objects by cloning an existing instance (the prototype) rather than constructing from scratch.

- **Use when:** Object creation is expensive (e.g., deep database hydration) or the system must be independent of how products are created.
- **Structure:** Prototype interface with `clone()` method; concrete prototypes implement deep copy.
- **Trade-offs:** Avoids costly initialization. Deep cloning complex object graphs with circular references is non-trivial.
- **Example:** Cloning a pre-configured `ServerConfig` object for each new connection instead of re-reading config files.

---

### Structural — Composing Classes/Objects

Patterns that deal with class and object composition to form larger structures while keeping them flexible and efficient.

#### Adapter

Converts the interface of a class into another interface clients expect, enabling classes to work together that otherwise could not.

- **Use when:** You want to use an existing class but its interface does not match the one you need.
- **Structure:** Target interface; Adapter wraps Adaptee and translates calls.
- **Trade-offs:** Enables reuse of incompatible classes. Can obscure the system if overused (too many translation layers).
- **Example:** Wrapping a third-party XML parser behind a `DataParser` interface so the rest of the system works with a unified contract.

#### Bridge

Decouples an abstraction from its implementation so the two can vary independently.

- **Use when:** Both the abstraction and its implementation may have multiple variants, and you want to combine them freely.
- **Structure:** Abstraction holds a reference to an Implementor interface; refined abstractions and concrete implementors vary independently.
- **Trade-offs:** Reduces class explosion from combining dimensions. Adds indirection.
- **Example:** `Shape` (Circle, Square) x `Renderer` (SVG, Canvas) — shapes delegate rendering to the renderer implementation.

#### Composite

Composes objects into tree structures to represent part-whole hierarchies, letting clients treat individual objects and compositions uniformly.

- **Use when:** You need to represent hierarchical structures and want clients to treat leaves and containers the same way.
- **Structure:** Component interface; Leaf implements operations directly; Composite holds children and delegates.
- **Trade-offs:** Simplifies client code that walks trees. Makes it harder to restrict composite contents to certain types.
- **Example:** File system — `File` (leaf) and `Directory` (composite) both implement `getSize()`, where directory sums children.

#### Decorator

Attaches additional responsibilities to an object dynamically, providing a flexible alternative to subclassing for extending functionality.

- **Use when:** You need to add behavior to individual objects without affecting other objects of the same class.
- **Structure:** Decorator implements the same interface as the component and wraps it, forwarding calls with added behavior.
- **Trade-offs:** More flexible than static inheritance. Can lead to many small wrapper objects that are hard to debug.
- **Example:** `LoggingVaultOps` wraps `VaultOps` and logs every method call before delegating to the inner implementation.

#### Facade

Provides a unified interface to a set of interfaces in a subsystem, making the subsystem easier to use.

- **Use when:** A subsystem is complex and clients only need a simplified view.
- **Structure:** Facade class delegates to subsystem classes internally.
- **Trade-offs:** Simplifies usage. Can become a "god object" if it tries to expose too much of the subsystem.
- **Example:** A `MediaConverter` facade that internally coordinates `VideoDecoder`, `AudioDecoder`, `Encoder`, and `FileWriter`.

#### Flyweight

Uses sharing to support large numbers of fine-grained objects efficiently by externalizing shared state.

- **Use when:** An application uses a large number of similar objects and memory is a constraint.
- **Structure:** Flyweight stores intrinsic (shared) state; extrinsic (context-specific) state is passed in by the client. A factory manages the shared pool.
- **Trade-offs:** Dramatically reduces memory. Adds complexity in separating intrinsic/extrinsic state.
- **Example:** A text editor where each character glyph object is shared; position and formatting are extrinsic.

#### Proxy

Provides a surrogate or placeholder for another object to control access to it.

- **Use when:** You need lazy initialization, access control, logging, or caching around an object.
- **Structure:** Proxy implements the same interface as the real subject and holds a reference to it, intercepting calls.
- **Trade-offs:** Transparent to the client. Adds a layer of indirection and potential latency.
- **Variants:** Virtual proxy (lazy init), protection proxy (access control), remote proxy (network), caching proxy.
- **Example:** An image proxy that loads the actual image data only when `display()` is first called.

---

### Behavioral — Communication Between Objects

Patterns that deal with algorithms and the assignment of responsibilities between objects.

#### Observer

Defines a one-to-many dependency so that when one object changes state, all dependents are notified and updated automatically.

- **Use when:** Changes in one object must be reflected in others without tight coupling.
- **Structure:** Subject maintains a list of observers; observers implement an `update()` method; subject calls `notify()` on state change.
- **Trade-offs:** Loose coupling between subject and observers. Can cause unexpected cascading updates and memory leaks if observers are not deregistered.
- **Example:** An event emitter where UI components subscribe to model changes.

#### Strategy

Defines a family of algorithms, encapsulates each one, and makes them interchangeable.

- **Use when:** You have multiple algorithms for a task and want to switch between them at runtime.
- **Structure:** Strategy interface; concrete strategies implement the algorithm; context holds a strategy reference.
- **Trade-offs:** Eliminates conditional logic. Clients must be aware of different strategies to select the right one.
- **Example:** `OutputStrategy` with `TextOutput` and `JsonOutput` implementations selected based on a `--json` flag.

#### Command

Encapsulates a request as an object, allowing parameterization of clients with different requests, queuing, logging, and undo operations.

- **Use when:** You need to decouple the sender of a request from the object that performs it, or you need undo/redo support.
- **Structure:** Command interface with `execute()`; concrete commands encapsulate a receiver and action; invoker triggers commands.
- **Trade-offs:** Decouples invocation from execution. Enables undo, queueing, and macro commands. Increases class count.
- **Example:** CLI dispatcher where each command is an object with `run(args)`, dispatched by name from a registry.

#### State

Allows an object to alter its behavior when its internal state changes, appearing to change its class.

- **Use when:** An object's behavior depends on its state and must change at runtime based on that state.
- **Structure:** Context delegates state-specific behavior to the current State object; State objects implement the same interface.
- **Trade-offs:** Eliminates large conditional blocks. State transitions are explicit. Adds classes per state.
- **Example:** A `Document` with states `Draft`, `Review`, `Published` — each state defines which operations are valid.

#### Template Method

Defines the skeleton of an algorithm in a base class, letting subclasses override specific steps without changing the algorithm's structure.

- **Use when:** Multiple classes share the same algorithm structure but differ in specific steps.
- **Structure:** Abstract class with a final `templateMethod()` calling abstract/hook steps; subclasses implement the varying steps.
- **Trade-offs:** Code reuse with controlled variation points. Subclass is forced into the parent's structure (inverted control).
- **Example:** `BaseCommand.run()` defines parse-validate-resolve-execute-output; subclasses override `execute()`.

#### Iterator

Provides a way to access elements of a collection sequentially without exposing its underlying representation.

- **Use when:** You need to traverse a collection without knowing its internal structure.
- **Structure:** Iterator interface with `next()`, `hasNext()`; collection provides a factory method to create iterators.
- **Trade-offs:** Decouples traversal from collection structure. Most modern languages provide built-in iteration protocols.
- **Example:** Tree traversal iterator that yields nodes in depth-first order regardless of the tree's internal representation.

#### Mediator

Defines an object that encapsulates how a set of objects interact, promoting loose coupling by preventing direct references.

- **Use when:** Many objects communicate in complex ways and direct references would create a web of dependencies.
- **Structure:** Mediator interface; concrete mediator coordinates communication; colleagues reference only the mediator.
- **Trade-offs:** Centralizes control and reduces direct dependencies. The mediator itself can become a monolith.
- **Example:** A chat room where participants send messages to the room (mediator) rather than directly to each other.

#### Chain of Responsibility

Passes a request along a chain of handlers, where each handler decides either to process it or pass it to the next handler.

- **Use when:** More than one object can handle a request and the handler is not known in advance.
- **Structure:** Handler interface with `handle()` and a reference to the next handler; concrete handlers process or pass.
- **Trade-offs:** Decouples sender from receivers. Request may go unhandled if no handler in the chain accepts it.
- **Example:** Middleware pipeline in a web framework — authentication, authorization, logging, rate limiting — each can short-circuit or pass through.

#### Visitor

Represents an operation to be performed on elements of an object structure, allowing new operations to be defined without changing the elements.

- **Use when:** You need to perform many distinct operations on a complex object structure and do not want to pollute element classes.
- **Structure:** Visitor interface with `visit()` for each element type; elements implement `accept(visitor)` dispatching to the right method.
- **Trade-offs:** Easy to add new operations. Hard to add new element types (all visitors must be updated). Breaks encapsulation.
- **Example:** A compiler AST where visitors implement type-checking, code generation, and optimization as separate operations over the same tree.

#### Memento

Captures and externalizes an object's internal state without violating encapsulation, so the object can be restored later.

- **Use when:** You need undo/redo or checkpointing of object state.
- **Structure:** Originator creates Memento containing its state; Caretaker stores mementos without examining their contents.
- **Trade-offs:** Enables state restoration without exposing internals. Can be memory-intensive if states are large.
- **Example:** Text editor undo stack where each keystroke stores a memento of the document state.

#### Interpreter

Defines a grammar for a language and provides an interpreter that uses the grammar to interpret sentences.

- **Use when:** You have a simple language or DSL that needs to be evaluated.
- **Structure:** Abstract expression with `interpret(context)`; terminal and non-terminal expressions form a syntax tree.
- **Trade-offs:** Good for simple grammars. Performance degrades with complex grammars; a parser generator is better for those.
- **Example:** Boolean expression evaluator: `AndExpression`, `OrExpression`, `VariableExpression` composing `true AND (false OR true)`.

---

### Architectural — System-Level Structure

Patterns that define the overall shape and organization of a software system.

#### MVC (Model-View-Controller)

Separates an application into three interconnected components: Model (data/logic), View (presentation), Controller (input handling).

- **Use when:** Building interactive applications where UI and business logic should vary independently.
- **Flow:** User interacts with Controller, which updates Model, which notifies View to re-render.
- **Trade-offs:** Clear separation of concerns. Can lead to fat controllers or tight model-view coupling in practice.

#### MVP (Model-View-Presenter)

Like MVC but the Presenter fully mediates between Model and View, and the View is passive (no direct Model access).

- **Use when:** You want a testable presentation layer where the View is a thin interface.
- **Flow:** View delegates all input to Presenter; Presenter updates Model and explicitly pushes data to View.
- **Trade-offs:** Highly testable (mock the View interface). Presenter can become bloated.

#### MVVM (Model-View-ViewModel)

The ViewModel exposes data and commands via data-binding, so the View automatically reflects ViewModel state.

- **Use when:** Using a framework with native data-binding support (WPF, SwiftUI, Vue, Angular).
- **Flow:** View binds to ViewModel properties; ViewModel transforms Model data; changes propagate automatically.
- **Trade-offs:** Eliminates manual view updates. Debugging data-binding issues can be opaque.

#### Hexagonal (Ports & Adapters)

Isolates the application core from external systems by defining ports (interfaces) and adapters (implementations).

- **Use when:** The application must be testable independently of UI, database, or external services.
- **Structure:** Core defines Port interfaces; Adapters implement them for specific technologies; core never references adapters directly.
- **Trade-offs:** Maximum testability and flexibility. More boilerplate (port + adapter for each external dependency).

#### Clean Architecture

Organizes code in concentric layers (Entities, Use Cases, Interface Adapters, Frameworks) with a strict dependency rule: inner layers never depend on outer layers.

- **Use when:** Building long-lived applications where business rules must survive technology changes.
- **Structure:** Entities (enterprise rules) -> Use Cases (application rules) -> Controllers/Gateways (adapters) -> Frameworks.
- **Trade-offs:** Business logic is fully decoupled. Can feel over-engineered for small applications.

#### Event-Driven

Components communicate through events rather than direct calls, enabling asynchronous, decoupled interaction.

- **Use when:** Components need loose coupling, the system must handle asynchronous workflows, or you need event replay/audit.
- **Structure:** Event producers emit events; event bus/broker routes them; event consumers react independently.
- **Trade-offs:** Highly decoupled and scalable. Harder to trace execution flow and debug.

#### Microservices

Structures an application as a collection of loosely coupled, independently deployable services, each owning its data.

- **Use when:** Teams need independent deployment cycles, different technology choices per service, or the system must scale components independently.
- **Trade-offs:** Team autonomy and independent scaling. Introduces distributed system complexity (networking, consistency, observability).

#### Layered

Organizes code into horizontal layers (Presentation, Business, Data) where each layer only depends on the layer below.

- **Use when:** Building traditional applications with clear separation between UI, logic, and persistence.
- **Trade-offs:** Simple to understand. Can lead to "lasagna code" where changes require touching every layer.

#### CQRS (Command Query Responsibility Segregation)

Separates read operations (queries) from write operations (commands) into distinct models.

- **Use when:** Read and write workloads have different scaling requirements or the domain is complex enough to benefit from separate models.
- **Trade-offs:** Optimized read/write paths independently. Adds complexity in keeping models consistent.

#### Event Sourcing

Stores the state of an entity as a sequence of state-changing events rather than current state, reconstructing state by replaying events.

- **Use when:** You need a complete audit trail, temporal queries ("what was the state at time T?"), or event-driven architectures.
- **Trade-offs:** Full audit trail and time-travel debugging. Event schema evolution and projection rebuilds are complex.

---

### Concurrency — Managing Parallel Execution

Patterns that address the challenges of multi-threaded and parallel programming.

#### Active Object

Decouples method execution from invocation by giving each object its own thread of control and a message queue.

- **Use when:** You need asynchronous method calls without exposing threading to callers.
- **Structure:** Proxy accepts requests, queues them as command objects, and a scheduler dispatches them on a private thread.
- **Trade-offs:** Clean async interface. Overhead of message queuing and context switching.

#### Monitor

Encapsulates shared data with synchronized access methods, ensuring only one thread can execute any method at a time.

- **Use when:** Multiple threads access shared mutable state and you need mutual exclusion.
- **Structure:** Object with synchronized methods and condition variables for wait/signal.
- **Trade-offs:** Simple mutual exclusion. Can become a bottleneck if many threads contend on the same monitor.

#### Thread Pool

Pre-creates a fixed number of worker threads that pull tasks from a shared queue, avoiding the overhead of thread creation per task.

- **Use when:** You handle many short-lived tasks and thread creation overhead matters.
- **Structure:** Pool of worker threads; task queue; workers dequeue and execute tasks.
- **Trade-offs:** Amortizes thread creation cost. Pool sizing requires tuning (too small starves, too large wastes resources).

#### Producer-Consumer

Decouples data production from consumption via a shared buffer, allowing producers and consumers to work at different rates.

- **Use when:** Producers and consumers operate at different speeds and you need to smooth throughput.
- **Structure:** Shared bounded buffer; producers enqueue; consumers dequeue; synchronization on empty/full conditions.
- **Trade-offs:** Decouples throughput. Buffer sizing and backpressure require careful design.

#### Read-Write Lock

Allows concurrent read access but exclusive write access, improving throughput when reads dominate writes.

- **Use when:** Shared data is read frequently and written infrequently.
- **Structure:** Lock with separate `readLock()` and `writeLock()`; multiple readers allowed, writers block all others.
- **Trade-offs:** Higher read throughput. Writers can be starved if reads are continuous. More complex than a simple mutex.

---

### Enterprise / Integration — Large-Scale Systems

Patterns commonly used in enterprise applications for data access, messaging, and distributed coordination.

#### Repository

Mediates between the domain and data mapping layers, providing a collection-like interface for accessing domain objects.

- **Use when:** You want to abstract the data store behind a domain-friendly API.
- **Structure:** Repository interface with `find()`, `save()`, `remove()`; implementation wraps ORM or raw queries.
- **Trade-offs:** Clean domain layer. Can become a "query dumping ground" if not focused.

#### Unit of Work

Maintains a list of objects affected by a business transaction and coordinates writing out changes in a single batch.

- **Use when:** Multiple domain objects must be persisted atomically.
- **Structure:** Tracks new, modified, and deleted objects; `commit()` writes all changes in one transaction.
- **Trade-offs:** Ensures consistency and reduces database round-trips. Adds tracking complexity.

#### Service Locator

Provides a central registry that returns service instances on demand, decoupling consumers from concrete implementations.

- **Use when:** You need a simple way to look up services without a full DI framework.
- **Structure:** Registry maps service names/types to implementations; consumers call `locator.get(ServiceType)`.
- **Trade-offs:** Simple to implement. Hides dependencies (unlike DI which makes them explicit), making testing and reasoning harder.

#### DTO (Data Transfer Object)

A plain object that carries data between processes or layers, with no business logic.

- **Use when:** Transferring data across boundaries (API responses, inter-service calls) and the domain model should not be exposed.
- **Structure:** Plain object/struct with public fields and no methods beyond getters/setters.
- **Trade-offs:** Clean boundary separation. Mapping between domain objects and DTOs adds boilerplate.

#### Gateway

Encapsulates access to an external system or resource behind an object-oriented interface.

- **Use when:** Accessing databases, web services, or message queues and you want to isolate the external system's API.
- **Structure:** Gateway interface with domain-friendly methods; implementation handles protocol details.
- **Trade-offs:** Isolates external dependencies. Each external system needs its own gateway.

#### Message Broker

A middleware component that routes messages between senders and receivers, enabling asynchronous communication.

- **Use when:** Services must communicate asynchronously with decoupled lifetimes.
- **Structure:** Producers publish messages to topics/queues; broker routes them; consumers subscribe and process.
- **Trade-offs:** Decouples producers and consumers, enables buffering. Adds operational complexity and potential points of failure.

#### Saga

Manages a long-running business transaction as a sequence of local transactions, each with a compensating action for rollback.

- **Use when:** Distributed transactions span multiple services and two-phase commit is not viable.
- **Structure:** Orchestrator or choreography coordinates a chain of steps; failure triggers compensating transactions in reverse.
- **Trade-offs:** Achieves eventual consistency without distributed locks. Compensation logic can be complex.

#### Circuit Breaker

Prevents a system from repeatedly trying an operation that is likely to fail, allowing it to recover gracefully.

- **Use when:** Calling an unreliable external service and you need to fail fast during outages.
- **Structure:** Three states: Closed (normal), Open (fail fast), Half-Open (test recovery). Tracks failure counts and timeouts.
- **Trade-offs:** Prevents cascading failures. Requires tuning thresholds and recovery timers.

---

### Functional — Common in FP Codebases

Patterns that leverage functional programming concepts for composition, error handling, and state management.

#### Monad

A composable computation wrapper that chains operations while handling context (e.g., nullability, errors, async) transparently.

- **Use when:** You need to chain operations that may fail, produce side effects, or carry context, without nested conditionals.
- **Structure:** A type `M<A>` with `of(a)` (wrapping) and `flatMap(f: A -> M<B>)` (chaining). Must satisfy identity and associativity laws.
- **Examples:** `Maybe/Option` (nullable), `Either/Result` (errors), `Promise` (async), `IO` (side effects).
- **Trade-offs:** Eliminates callback/null pyramids. Requires understanding algebraic laws; can feel abstract.

#### Functor

A type that can be mapped over, applying a function to its wrapped value without changing the wrapper's structure.

- **Use when:** You want to transform values inside a container (array, optional, tree) uniformly.
- **Structure:** `map(f: A -> B): F<B>` — applies `f` to the inner value.
- **Examples:** `Array.map()`, `Option.map()`, `Promise.then()` (simplified).
- **Trade-offs:** Composable transformations. The concept is simple but naming can confuse newcomers.

#### Lens

A composable accessor for reading and updating nested immutable data structures.

- **Use when:** Working with deeply nested immutable objects and you need to update a specific field without manual spreading.
- **Structure:** `Lens<S, A>` with `get(s: S): A` and `set(a: A, s: S): S`. Lenses compose: `addressLens.compose(streetLens)`.
- **Trade-offs:** Clean nested updates. Requires a lens library; learning curve for unfamiliar teams.

#### Continuation

Represents "the rest of the computation" as a first-class function, enabling non-local control flow.

- **Use when:** You need to implement backtracking, coroutines, or custom control flow.
- **Structure:** Continuation-passing style (CPS) — functions take an extra parameter `k` representing what to do next.
- **Trade-offs:** Extremely powerful control flow. CPS code is notoriously hard to read and debug.

#### Trampolining

Converts recursive calls into an iterative loop to avoid stack overflow, using thunks (lazy function wrappers).

- **Use when:** You have deep recursion in a language without tail-call optimization.
- **Structure:** Instead of returning a value, recursive steps return a `Thunk(() => nextStep)`. A `trampoline()` loop iteratively evaluates thunks until a final value is produced.
- **Trade-offs:** Enables arbitrarily deep "recursion" without stack overflow. Adds wrapping overhead and changes the function signature.

---

### Domain-Driven Design (DDD)

Patterns for modeling complex business domains as the core of software design.

#### Aggregate

A cluster of domain objects treated as a single unit for data consistency, with a designated Aggregate Root that controls access.

- **Use when:** A group of related entities must be changed together atomically and you need to enforce invariants across them.
- **Structure:** Aggregate Root (the only externally addressable entity); internal entities and value objects; consistency boundary.
- **Trade-offs:** Enforces transactional consistency. Choosing aggregate boundaries is the hardest design decision in DDD.

#### Entity

An object defined primarily by its identity rather than its attributes — two entities with the same data but different IDs are different.

- **Use when:** The object must be tracked across time and state changes (e.g., a User, an Order).
- **Structure:** Has a unique identifier; equality is based on ID, not field values.
- **Trade-offs:** Clear identity semantics. Must manage ID generation and equality logic.

#### Value Object

An object defined by its attributes with no conceptual identity — two value objects with the same data are equal.

- **Use when:** The concept is defined by what it is, not who it is (e.g., Money, Address, DateRange).
- **Structure:** Immutable; equality is based on all fields; no identity field.
- **Trade-offs:** Simple, safe, and highly reusable. Replacing rather than mutating can feel verbose.

#### Domain Event

A record of something that happened in the domain, expressed in the ubiquitous language.

- **Use when:** Other parts of the system need to react to domain changes without coupling to the source.
- **Structure:** Immutable event object with timestamp, aggregate ID, and event-specific data. Published after state changes.
- **Trade-offs:** Decouples producers from consumers. Requires event infrastructure and handling of eventual consistency.

#### Bounded Context

A boundary within which a particular domain model is defined and applicable — the same term can mean different things in different contexts.

- **Use when:** A large domain has subdomains where the same words have different meanings (e.g., "Account" in billing vs. authentication).
- **Structure:** Each bounded context has its own model, its own ubiquitous language, and explicit integration with other contexts.
- **Trade-offs:** Prevents model pollution across teams. Requires clear context mapping and translation at boundaries.

#### Anti-Corruption Layer

A translation layer that isolates a system's domain model from external or legacy systems, preventing foreign concepts from leaking in.

- **Use when:** Integrating with a legacy system, third-party API, or another bounded context whose model differs from yours.
- **Structure:** Facade + Adapter + Translator that converts foreign data/concepts into your domain's language.
- **Trade-offs:** Protects domain model purity. Adds a translation layer that must be maintained.
