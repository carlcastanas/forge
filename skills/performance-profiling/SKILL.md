---
name: performance-profiling
description: Find the actual bottleneck in a slow program using CPU, memory, and IO profilers, then prove the fix with measurement. Covers measurement hygiene, profiler selection per runtime, flame graph reading, allocation and leak analysis, and IO-bound diagnosis. Use when something is slow and the cause is unknown, when an optimization needs to be justified, or when memory use grows without explanation.
metadata:
  origin: FORGE
---

# Performance Profiling

Most performance work fails because it optimizes the wrong thing. This skill enforces the order that makes optimization pay: reproduce the slowness, measure a baseline, profile the resource that is actually saturated, change one thing, re-measure. Done means a profile identifies a specific frame or query, a change moves the metric outside measurement noise, and the improvement holds under production-like conditions.

## When to activate

- A request, job, or build is slower than it should be and nobody knows which part
- Memory grows over hours or days until the process is killed
- CPU is pinned but throughput is flat
- A proposed optimization needs evidence before the effort is spent
- A regression appeared between two versions and needs to be localized
- User says "this is slow", "profile this", "why is it using so much memory", "where is the time going"

## When NOT to use

- Deciding how much traffic the system survives before degrading — see `../load-testing/SKILL.md`
- Finding which service in a distributed call chain is slow — start with traces: `../observability-instrumentation/SKILL.md`
- Comparing implementations under a controlled harness with statistical rigor — see `../benchmark-methodology/SKILL.md`
- Designing a system for a fixed tail-latency budget from the start — see `../latency-critical-systems/SKILL.md`

## Prerequisites

- A reproducible slow case: a script, a request, or a saved production payload
- Permission to run a profiler where the slowness happens (staging with production-shaped data, or production with a low-overhead sampling profiler)
- For native profiling on Linux: `perf_event_paranoid` relaxed and the process built with frame pointers or accurate unwind data
- A metric to move, defined before profiling starts (p99 of one endpoint, wall time of one job, peak RSS)

## Process

### 1. Establish measurement hygiene before touching a profiler

An unreliable baseline makes every later conclusion unreliable.

- **Reproduce first.** If the slow case cannot be triggered on demand, no profile will be trustworthy.
- **Warm up.** JIT runtimes, connection pools, and page caches all make the first iterations unrepresentative. Discard them explicitly.
- **Repeat and record spread.** Run the baseline at least five times and report median plus spread. A change smaller than the run-to-run spread is not a result.
- **Change one variable.** Two simultaneous optimizations produce an uninterpretable measurement.
- **Control the machine.** Close other workloads. On laptops, frequency scaling and thermal throttling dominate small differences; pin the workload or move to a stable host.
- **Match production shape.** Data volume, cache hit ratio, network latency, and concurrency change which frame is hot. A profile taken against an empty database measures the wrong program.

```bash
# Reduce the obvious sources of variance on a Linux benchmark host
sudo cpupower frequency-set --governor performance
echo 0 | sudo tee /proc/sys/kernel/randomize_va_space   # ASLR off: layout-sensitive runs
echo 1 | sudo tee /proc/sys/kernel/perf_event_paranoid  # allow perf for non-root

# Baseline: warm up, then record repeated timings
for i in $(seq 1 3); do ./run-case.sh >/dev/null; done
for i in $(seq 1 7); do /usr/bin/time -f '%e %M' ./run-case.sh >/dev/null; done
```

Restore ASLR after the run; leaving it disabled is a security regression.

### 2. Identify which resource is saturated

Profile the resource that is actually the constraint. Guessing here wastes the whole exercise.

```bash
top -H -p "$PID"        # per-thread CPU: is one thread pinned or all of them
pidstat -d -p "$PID" 1  # IO throughput per process
iostat -xz 1            # device utilization, await, queue depth
vmstat 1                # run queue, context switches, swap activity
strace -c -f -p "$PID"  # syscall counts and time; reveals blocking IO patterns
```

| Observation | Constraint | Profiler class |
| --- | --- | --- |
| CPU near 100 percent on busy threads | On-CPU | Sampling CPU profiler, flame graph |
| Low CPU, high wall time | Off-CPU (blocked) | Off-CPU / wall-clock profiler, syscall trace |
| RSS climbing over time | Memory | Allocation profiler, heap snapshots |
| High `await` or device utilization | Disk IO | `iostat`, block tracing, query plans |
| High context switches, low throughput | Lock contention | Lock profiler, off-CPU stacks |

### 3. Pick the profiler for the runtime

```bash
# Native (C/C++/Rust/Go binaries), on-CPU sampling at 99 Hz to avoid lockstep with timers
perf record -F 99 -g -- ./my-binary --workload heavy
perf script | stackcollapse-perf.pl | flamegraph.pl > cpu.svg

# Python, no restart required, attaches to a running process
py-spy record -o out.svg --pid "$PID" --duration 60
py-spy dump --pid "$PID"          # instant stack snapshot of every thread

# Node.js
node --cpu-prof --cpu-prof-dir=./profiles server.js   # writes .cpuprofile for DevTools
npx clinic flame -- node server.js                    # flame graph including native frames
npx 0x -- node server.js                              # alternative flame graph generator

# Go: expose pprof, then explore interactively
go tool pprof -http=:8080 http://localhost:6060/debug/pprof/profile?seconds=30
go tool pprof -http=:8080 http://localhost:6060/debug/pprof/heap
go tool pprof -http=:8080 http://localhost:6060/debug/pprof/block

# JVM
asprof -d 60 -e cpu -f cpu.html "$PID"       # async-profiler, on-CPU
asprof -d 60 -e alloc -f alloc.html "$PID"   # allocation profile
asprof -d 60 -e wall -t -f wall.html "$PID"  # wall-clock, per-thread

# .NET
dotnet-trace collect --process-id "$PID" --profile cpu-sampling
dotnet-counters monitor --process-id "$PID"

# Rust convenience wrapper over perf
cargo flamegraph --bin my-service -- --workload heavy
```

Go's pprof endpoint needs one import to exist:

```go
import _ "net/http/pprof"

func init() {
    go func() { _ = http.ListenAndServe("localhost:6060", nil) }()
}
```

Bind pprof to localhost and reach it through a port-forward. An open pprof endpoint leaks internals and allows a trivial resource-exhaustion request.

### 4. Read the flame graph correctly

- **Width is time, depth is only stack depth.** A tall narrow tower is irrelevant; a wide shallow plateau is where the time went.
- **Order along the x-axis is alphabetical, not chronological.** Nothing can be inferred from left-to-right position.
- **Read leaf frames for self time, ancestor frames for total time.** The frame worth optimizing is usually the widest frame that you control, not the widest frame overall.
- **Icicle (inverted) layout** merges all callers of a hot leaf, which answers "who is calling this expensive function".
- **Differential flame graphs** compare two profiles and colour the delta; this is the fastest way to localize a regression between two versions.

```bash
# Differential: what got wider between the old and new build
perf record -F 99 -g -o old.data -- ./old-binary --workload heavy
perf record -F 99 -g -o new.data -- ./new-binary --workload heavy
perf script -i old.data | stackcollapse-perf.pl > old.folded
perf script -i new.data | stackcollapse-perf.pl > new.folded
difffolded.pl old.folded new.folded | flamegraph.pl > diff.svg
```

If the graph is a wall of unresolved addresses, symbols are missing: build with `-fno-omit-frame-pointer` and debug info, install the debug symbol package, or enable the runtime's perf map (`--perf-basic-prof` for Node, `-XX:+PreserveFramePointer` for the JVM).

### 5. Diagnose memory by category

The three memory problems look identical from the outside and have different fixes.

| Category | Signature | Typical cause |
| --- | --- | --- |
| Leak | RSS and live heap both grow monotonically | Unbounded cache, listener never removed, retained closure |
| Fragmentation | RSS grows while live heap is flat | Allocator returning nothing to the OS; mixed allocation sizes |
| Bloat | RSS stable but far higher than expected | Oversized buffers, per-request copies, inefficient representations |

```bash
# Native allocation tracking with full stacks
heaptrack ./my-binary --workload heavy
heaptrack_gui heaptrack.my-binary.*.zst

# Peak-usage attribution over time
valgrind --tool=massif ./my-binary
ms_print massif.out.*

# Node heap snapshot to load in DevTools Memory tab
node --heapsnapshot-signal=SIGUSR2 server.js
kill -USR2 "$PID"

# Go heap, sorted by what is still live
go tool pprof -http=:8080 http://localhost:6060/debug/pprof/heap
```

Take two snapshots separated by a period of steady traffic and compare. Sort by retained size and read the dominator tree: the object that, if freed, releases the most memory is the one holding the leak. A large shallow-size object that is not a dominator is rarely the problem.

Distinguish RSS from heap explicitly. Runtime heap flat plus RSS climbing points at fragmentation or native allocations outside the managed heap (native modules, thread stacks, memory-mapped files).

### 6. Diagnose IO before blaming code

```bash
strace -c -f -p "$PID"                           # which syscalls dominate, and total time
strace -T -e trace=read,write,openat -p "$PID"   # per-call latency
iostat -xz 1                                     # %util, r_await, w_await, queue depth
```

For database-backed slowness, the profiler will show time inside the driver's socket read, which is accurate but useless on its own. Go to the query plan:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT o.id, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE c.tenant_id = $1 AND o.created_at > now() - interval '7 days';
```

Read actual rows against estimated rows (a large mismatch means bad statistics), the buffer counts (high `shared read` means the working set does not fit in cache), and loop counts (a nested loop executed once per outer row is the N+1 pattern surfacing at the SQL layer). N+1 queries almost never appear as a hot CPU frame; they appear as many small identical spans in a trace or many identical statements in the database log.

### 7. Find off-CPU time when CPU is idle but latency is high

```bash
# Off-CPU stacks: where threads block, and for how long (microseconds, per stack)
sudo offcputime-bpfcc -p "$PID" --stack-storage-size 16384 30 > offcpu.folded
flamegraph.pl --title "Off-CPU" --colors=io offcpu.folded > offcpu.svg

# async-profiler wall-clock mode captures both running and blocked threads
asprof -d 60 -e wall -t -f wall.html "$PID"
```

Wall-clock profiling is the right default for request handlers, which spend most of their life waiting. An on-CPU profile of an IO-bound service shows the serialization code as hot and hides the ten seconds spent waiting on a lock.

### 8. Apply Amdahl's law before optimizing

The ceiling on any optimization is set by the fraction of total time it touches. A component consuming a quarter of total time cannot yield more than a 25 percent improvement even if it is made instantaneous. Compute that ceiling from the profile first, and only start work if the ceiling justifies the effort.

Then change exactly one thing, re-run the baseline procedure from step 1, and compare against the recorded spread. Keep the before-and-after profiles; they are the evidence that the change did what it claimed. If the improvement does not survive production-shaped data and concurrency, it did not happen.

## Checklist

- [ ] Slow case reproduces on demand
- [ ] Target metric named before profiling started
- [ ] Baseline recorded as median plus spread across repeated warm runs
- [ ] Saturated resource identified before a profiler was chosen
- [ ] Profiler matched to the resource (on-CPU, wall-clock, allocation, or IO)
- [ ] Symbols resolve; no wall of raw addresses in the flame graph
- [ ] Hot path identified by width in the profile, not by intuition or code reading
- [ ] Amdahl ceiling computed and judged worth the effort
- [ ] Exactly one change applied per measurement cycle
- [ ] Improvement exceeds run-to-run spread and holds with production-shaped data
- [ ] Before and after profiles kept with the change
- [ ] ASLR, governor, and any pprof endpoints restored to their production settings

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Flame graph is mostly unknown addresses | Frame pointers omitted or debug symbols absent | Rebuild with `-fno-omit-frame-pointer` and debug info; install debug symbols; enable the runtime perf map |
| Profile shows only the event loop or scheduler as hot | On-CPU profiler used on an IO-bound workload | Switch to wall-clock or off-CPU profiling |
| Optimization measured as faster locally, unchanged in production | Profiled against unrepresentative data or concurrency | Reprofile with production-shaped data volume and cache state |
| Results differ by a large margin run to run | No warmup, background load, or frequency scaling | Add warmup iterations, quiesce the host, pin the governor, report medians |
| Fixing the top frame yields no improvement | Frame was wide but not on the critical path, or the ceiling was small | Recompute the Amdahl ceiling; look for off-CPU time not shown in the profile |
| Memory grows but heap snapshots look clean | Native allocations outside the managed heap, or fragmentation | Use `heaptrack`/`massif`; compare RSS against runtime heap metrics |
| Two snapshots show many objects but no clear owner | Reading shallow size instead of retained size | Sort by retained size and read the dominator tree |
| Database time invisible in the profile | Time spent inside a socket read attributed to the driver | Read the query plan with `EXPLAIN (ANALYZE, BUFFERS)` and the trace spans |

## References

- `../load-testing/SKILL.md` — generating the load that makes a bottleneck reproducible
- `../observability-instrumentation/SKILL.md` — traces that localize slowness to a service before profiling it
- `../benchmark-methodology/SKILL.md` — statistically defensible comparison of two implementations
- `../latency-critical-systems/SKILL.md` — designing to a tail-latency budget
- Linux `perf` documentation and the FlameGraph toolkit (`stackcollapse-perf.pl`, `flamegraph.pl`, `difffolded.pl`)
- Go `runtime/pprof` and `net/http/pprof` package documentation
- async-profiler documentation for JVM CPU, allocation, and wall-clock modes
- `py-spy`, `clinic`, `dotnet-trace`, `heaptrack`, and Valgrind Massif manuals
- The USE method (utilization, saturation, errors) and off-CPU analysis literature
