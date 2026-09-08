'use client';

import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AlertIcon,
  CheckIcon,
  CopyIcon,
  InfoIcon,
  SearchIcon,
} from '@/components/icons';
import type { InstallComponent, InstallData, InstallModule } from '@/lib/install';

/* --- Command assembly ----------------------------------------------------- */

const BASE_COMMAND = ['npx', 'forge-universal', 'install'];
const SKILL_PREFIX = 'skill:';
const HOOKS_MODULE = 'hooks-runtime';
const HOOKS_COMPONENT = 'baseline:hooks';

/** Row heights are fixed so the windowed list can index by offset alone. */
const GROUP_ROW_HEIGHT = 36;
const ITEM_ROW_HEIGHT = 58;
const OVERSCAN = 6;

type HookChoice = string; // one of data.hookProfiles, or 'none'

type Selection = {
  profileId: string | null;
  target: string;
  added: ReadonlySet<string>;
  removed: ReadonlySet<string>;
  hooks: HookChoice;
  dryRun: boolean;
};

type ResolvedPlan = {
  moduleIds: string[];
  skillCount: number;
  pathCount: number;
  /** Modules dropped because the chosen target does not declare support. */
  skippedForTarget: string[];
  /** Exclusions the real resolver would reject outright. */
  conflicts: string[];
};

function setsAreEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Mirrors resolveModule() in scripts/lib/install-manifests.js: dependency-first
 * traversal, exclusions win over requests, and a module whose target list omits the
 * chosen harness takes its requester down with it. The one thing this cannot do in a
 * browser is run each adapter's supportsModule() probe, which is why the page points
 * at --dry-run for the authoritative plan.
 */
function resolvePlan(
  requestedModuleIds: string[],
  excludedModuleIds: ReadonlySet<string>,
  target: string,
  moduleById: Map<string, InstallModule>,
): ResolvedPlan {
  const selected = new Set<string>();
  const resolved = new Set<string>();
  const visiting = new Set<string>();
  const skipped = new Set<string>();
  const conflicts: string[] = [];

  // A module can fail for two different reasons and they read differently to the
  // user, so the reason travels back up the recursion rather than a bare boolean.
  type WalkResult = 'ok' | 'excluded' | 'unsupported' | 'missing';

  function walk(id: string, dependencyOf: string | null, rootRequester: string): WalkResult {
    const entry = moduleById.get(id);
    if (!entry) return 'missing';

    if (excludedModuleIds.has(id)) {
      if (dependencyOf) {
        conflicts.push(`${dependencyOf} depends on the excluded module ${id}`);
      }
      return 'excluded';
    }

    if (!entry.targets.includes(target)) {
      skipped.add(rootRequester);
      return 'unsupported';
    }

    if (resolved.has(id)) return 'ok';
    if (visiting.has(id)) return 'ok';

    visiting.add(id);
    for (const dependencyId of entry.dependencies) {
      const result = walk(dependencyId, id, rootRequester);
      if (result !== 'ok') {
        visiting.delete(id);
        return result;
      }
    }
    visiting.delete(id);

    resolved.add(id);
    selected.add(id);
    return 'ok';
  }

  for (const id of requestedModuleIds) {
    if (!excludedModuleIds.has(id)) walk(id, null, id);
  }

  const moduleIds = [...selected];
  return {
    moduleIds,
    skillCount: moduleIds.reduce((total, id) => total + (moduleById.get(id)?.skillCount ?? 0), 0),
    pathCount: moduleIds.reduce((total, id) => total + (moduleById.get(id)?.pathCount ?? 0), 0),
    skippedForTarget: [...skipped],
    conflicts: [...new Set(conflicts)],
  };
}

/* --- URL state ------------------------------------------------------------ */

function readList(params: URLSearchParams, key: string): Set<string> {
  const raw = params.get(key);
  if (!raw) return new Set();
  return new Set(raw.split(',').map((value) => value.trim()).filter(Boolean));
}

function writeQuery(selection: Selection, defaultTarget: string, defaultHooks: string): string {
  const params = new URLSearchParams();
  if (selection.profileId) params.set('p', selection.profileId);
  if (selection.target !== defaultTarget) params.set('t', selection.target);
  if (selection.added.size > 0) params.set('w', [...selection.added].sort().join(','));
  if (selection.removed.size > 0) params.set('x', [...selection.removed].sort().join(','));
  if (selection.hooks !== defaultHooks) params.set('h', selection.hooks);
  if (selection.dryRun) params.set('d', '1');
  const query = params.toString();
  return query ? `?${query}` : '';
}

/* --- Component ------------------------------------------------------------ */

export function InstallBuilder({ data }: { data: InstallData }) {
  const searchParams = useSearchParams();

  const defaultTarget = useMemo(
    () => data.targets.find((entry) => entry.isDefault)?.id ?? data.targets[0]?.id ?? 'claude',
    [data.targets],
  );
  const defaultHooks = data.defaultHookProfile;
  const hookChoices = useMemo(() => [...data.hookProfiles, 'none'], [data.hookProfiles]);

  const componentById = useMemo(
    () => new Map(data.components.map((component) => [component.id, component] as const)),
    [data.components],
  );
  const moduleById = useMemo(
    () => new Map(data.modules.map((module) => [module.id, module] as const)),
    [data.modules],
  );
  const profileById = useMemo(
    () => new Map(data.profiles.map((profile) => [profile.id, profile] as const)),
    [data.profiles],
  );

  /* --- Selection state, seeded once from the query string --- */

  const [selection, setSelection] = useState<Selection>(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    const profileId = params.get('p');
    const target = params.get('t');
    const hooks = params.get('h');
    return {
      profileId: profileId && profileById.has(profileId) ? profileId : null,
      target: target && data.targets.some((entry) => entry.id === target) ? target : defaultTarget,
      added: readList(params, 'w'),
      removed: readList(params, 'x'),
      hooks: hooks && hookChoices.includes(hooks) ? hooks : defaultHooks,
      dryRun: params.get('d') === '1',
    };
  });

  // The query string is a share link, not a navigation. replaceState keeps it in sync
  // without pushing history entries or re-running the router on every keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const query = writeQuery(selection, defaultTarget, defaultHooks);
      window.history.replaceState(null, '', `${window.location.pathname}${query}`);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [selection, defaultTarget, defaultHooks]);

  /* --- Derived selection --- */

  const baseline = useMemo(() => {
    const profile = selection.profileId ? profileById.get(selection.profileId) : null;
    return new Set(profile?.componentIds ?? []);
  }, [selection.profileId, profileById]);

  const selectedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of baseline) if (!selection.removed.has(id)) next.add(id);
    for (const id of selection.added) if (componentById.has(id)) next.add(id);
    return next;
  }, [baseline, selection.removed, selection.added, componentById]);

  const toggleComponent = useCallback(
    (id: string) => {
      setSelection((current) => {
        const profile = current.profileId ? profileById.get(current.profileId) : null;
        const base = new Set(profile?.componentIds ?? []);
        const isSelected = base.has(id) ? !current.removed.has(id) : current.added.has(id);
        const added = new Set(current.added);
        const removed = new Set(current.removed);

        if (base.has(id)) {
          if (isSelected) removed.add(id);
          else removed.delete(id);
          added.delete(id);
        } else if (isSelected) {
          added.delete(id);
        } else {
          added.add(id);
        }

        return { ...current, added, removed };
      });
    },
    [profileById],
  );

  const setManyComponents = useCallback(
    (ids: string[], nextSelected: boolean) => {
      setSelection((current) => {
        const profile = current.profileId ? profileById.get(current.profileId) : null;
        const base = new Set(profile?.componentIds ?? []);
        const added = new Set(current.added);
        const removed = new Set(current.removed);

        for (const id of ids) {
          if (base.has(id)) {
            if (nextSelected) removed.delete(id);
            else removed.add(id);
            added.delete(id);
          } else if (nextSelected) {
            added.add(id);
          } else {
            added.delete(id);
          }
        }

        return { ...current, added, removed };
      });
    },
    [profileById],
  );

  const chooseProfile = useCallback((profileId: string | null) => {
    // A profile reseeds the selection; keeping stale diffs would silently distort it.
    setSelection((current) => ({ ...current, profileId, added: new Set(), removed: new Set() }));
  }, []);

  const clearAll = useCallback(() => {
    setSelection({
      profileId: null,
      target: defaultTarget,
      added: new Set(),
      removed: new Set(),
      hooks: defaultHooks,
      dryRun: false,
    });
  }, [defaultTarget, defaultHooks]);

  /* --- Command --- */

  const exactProfile = useMemo(() => {
    const candidates = data.profiles.filter((profile) =>
      setsAreEqual(new Set(profile.componentIds), selectedIds),
    );
    if (candidates.length === 0) return null;
    return candidates.find((profile) => profile.id === selection.profileId) ?? candidates[0];
  }, [data.profiles, selectedIds, selection.profileId]);

  const command = useMemo(() => {
    const parts = [...BASE_COMMAND];
    const addedIds = [...selection.added].filter((id) => componentById.has(id)).sort();
    const removedIds = [...selection.removed].filter((id) => baseline.has(id)).sort();

    if (exactProfile) {
      parts.push('--profile', exactProfile.id);
      parts.push('--target', selection.target);
    } else {
      if (selection.profileId) parts.push('--profile', selection.profileId);
      parts.push('--target', selection.target);

      const skillIds = addedIds
        .filter((id) => id.startsWith(SKILL_PREFIX))
        .map((id) => id.slice(SKILL_PREFIX.length));
      for (const id of addedIds.filter((entry) => !entry.startsWith(SKILL_PREFIX))) {
        parts.push('--with', id);
      }
      if (skillIds.length > 0) parts.push('--skills', skillIds.join(','));
      for (const id of removedIds) parts.push('--without', id);
    }

    if (selection.hooks === 'none') {
      parts.push('--no-hooks');
    }
    if (selection.dryRun) parts.push('--dry-run');

    return { parts, addedIds, removedIds };
  }, [selection, componentById, baseline, exactProfile]);

  /* --- Resolved plan --- */

  const plan = useMemo(() => {
    const requested: string[] = [];
    const profile = selection.profileId ? profileById.get(selection.profileId) : null;
    if (exactProfile) {
      requested.push(...exactProfile.modules);
    } else {
      if (profile) requested.push(...profile.modules);
      for (const id of command.addedIds) {
        const component = componentById.get(id);
        if (component) requested.push(...component.modules);
      }
    }

    const excluded = new Set<string>();
    if (!exactProfile) {
      for (const id of command.removedIds) {
        const component = componentById.get(id);
        if (component) component.modules.forEach((moduleId) => excluded.add(moduleId));
      }
    }

    const resolved = resolvePlan([...new Set(requested)], excluded, selection.target, moduleById);

    if (selection.hooks !== 'none') return resolved;

    // --no-hooks strips the hook runtime from the applied plan.
    const moduleIds = resolved.moduleIds.filter((id) => id !== HOOKS_MODULE);
    return {
      ...resolved,
      moduleIds,
      skillCount: moduleIds.reduce((total, id) => total + (moduleById.get(id)?.skillCount ?? 0), 0),
      pathCount: moduleIds.reduce((total, id) => total + (moduleById.get(id)?.pathCount ?? 0), 0),
    };
  }, [selection, exactProfile, profileById, componentById, moduleById, command]);

  const hooksEnabled = selection.hooks !== 'none' && plan.moduleIds.includes(HOOKS_MODULE);

  const commandLine = useMemo(() => {
    const parts = [...command.parts];
    // The hook runtime needs explicit consent whenever the plan materializes it.
    if (hooksEnabled) {
      const insertAt = parts.indexOf('--dry-run');
      if (insertAt === -1) parts.push('--enable-hooks');
      else parts.splice(insertAt, 0, '--enable-hooks');
    }
    return parts.join(' ');
  }, [command.parts, hooksEnabled]);

  // FORGE_HOOK_PROFILE gates which hooks run at agent runtime, not at install time,
  // so it is a separate exported line rather than a flag on the install command.
  const envLine =
    hooksEnabled && selection.hooks !== defaultHooks
      ? `export FORGE_HOOK_PROFILE=${selection.hooks}`
      : null;

  const copyPayload = envLine ? `${envLine}\n${commandLine}` : commandLine;

  const warnings = useMemo(() => {
    const list: string[] = [];
    if (selectedIds.size === 0) {
      list.push('Nothing selected. The installer needs a profile, a module, or a component.');
    }
    for (const conflict of plan.conflicts) {
      list.push(`${conflict}. The installer rejects this combination.`);
    }
    if (plan.skippedForTarget.length > 0) {
      const many = plan.skippedForTarget.length !== 1;
      list.push(
        `${plan.skippedForTarget.length} module${many ? 's' : ''} skipped. ` +
          `${plan.skippedForTarget.slice(0, 4).join(', ')}` +
          `${plan.skippedForTarget.length > 4 ? ', and others' : ''} ` +
          `${many ? 'do' : 'does'} not declare support for --target ${selection.target}.`,
      );
    }
    return list;
  }, [selectedIds.size, plan, selection.target]);

  /* --- Refine grid --- */

  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<string | null>(null);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return data.components.filter((component) => {
      if (familyFilter && component.family !== familyFilter) return false;
      if (selectedOnly && !selectedIds.has(component.id)) return false;
      if (!needle) return true;
      return (
        component.id.toLowerCase().includes(needle) ||
        component.description.toLowerCase().includes(needle)
      );
    });
  }, [data.components, deferredQuery, familyFilter, selectedOnly, selectedIds]);

  type Row =
    | { kind: 'group'; key: string; label: string; count: number; height: number }
    | { kind: 'item'; key: string; component: InstallComponent; height: number };

  const rows = useMemo<Row[]>(() => {
    const byFamily = new Map<string, InstallComponent[]>();
    for (const component of filtered) {
      const bucket = byFamily.get(component.family);
      if (bucket) bucket.push(component);
      else byFamily.set(component.family, [component]);
    }

    const out: Row[] = [];
    for (const family of data.families) {
      const bucket = byFamily.get(family.id);
      if (!bucket || bucket.length === 0) continue;
      out.push({
        kind: 'group',
        key: `group-${family.id}`,
        label: family.label,
        count: bucket.length,
        height: GROUP_ROW_HEIGHT,
      });
      for (const component of bucket) {
        out.push({ kind: 'item', key: component.id, component, height: ITEM_ROW_HEIGHT });
      }
    }
    return out;
  }, [filtered, data.families]);

  const offsets = useMemo(() => {
    const values = new Array<number>(rows.length + 1);
    values[0] = 0;
    for (let index = 0; index < rows.length; index += 1) {
      values[index + 1] = values[index] + rows[index].height;
    }
    return values;
  }, [rows]);

  const totalHeight = offsets[offsets.length - 1] ?? 0;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 520 });
  const frame = useRef<number | null>(null);

  const onScroll = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      const element = scrollRef.current;
      if (element) setViewport({ top: element.scrollTop, height: element.clientHeight });
    });
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewport((current) => ({ ...current, height: element.clientHeight }));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  // Any change to the filter puts the window back at the top of the list.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setViewport((current) => ({ ...current, top: 0 }));
  }, [deferredQuery, familyFilter, selectedOnly]);

  const [startIndex, endIndex] = useMemo(() => {
    if (rows.length === 0) return [0, 0];
    const find = (position: number) => {
      let low = 0;
      let high = rows.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (offsets[mid + 1] <= position) low = mid + 1;
        else high = mid;
      }
      return Math.min(low, rows.length - 1);
    };
    const first = Math.max(0, find(viewport.top) - OVERSCAN);
    const last = Math.min(rows.length, find(viewport.top + viewport.height) + 1 + OVERSCAN);
    return [first, last];
  }, [rows, offsets, viewport]);

  const visibleRows = rows.slice(startIndex, endIndex);
  const filtering = Boolean(deferredQuery.trim()) || familyFilter !== null || selectedOnly;

  /* --- Copy --- */

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyPayload);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2400);
    } catch {
      // Clipboard permission can be denied; the command stays selectable by hand.
    }
  }, [copyPayload]);

  /* --- Bar height, so the bar never covers the last row --- */

  const barRef = useRef<HTMLDivElement | null>(null);

  // The bar is fixed to the viewport, so the reservation has to live on the page
  // shell rather than on this component: the footer sits below it in the document.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--ib-bar-h', `${bar.offsetHeight}px`);
    root.classList.add('has-install-bar');
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.classList.remove('has-install-bar');
      root.style.removeProperty('--ib-bar-h');
    };
  }, []);

  /* --- Render --- */

  return (
    <div className="ib">
      {/* Step 1 — profile */}
      <section className="ib-step" aria-labelledby="ib-step-profile">
        <div className="ib-step__head">
          <span className="ib-step__num" aria-hidden="true">
            1
          </span>
          <div>
            <h2 className="t-h3" id="ib-step-profile">
              Pick a starting profile
            </h2>
            <p className="t-small u-muted">
              A profile is a named module set in manifests/install-profiles.json. It seeds the
              selection below; every component stays editable afterwards.
            </p>
          </div>
        </div>

        <div className="ib-profiles" role="group" aria-label="Install profile">
          {data.profiles.map((profile) => {
            const active = selection.profileId === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                aria-pressed={active}
                className="ib-profile"
                onClick={() => chooseProfile(active ? null : profile.id)}
              >
                <span className="ib-profile__name u-mono">{profile.id}</span>
                <span className="ib-profile__desc">{profile.description}</span>
                <span className="ib-profile__meta">
                  <span>{profile.modules.length} modules requested</span>
                  <span>{profile.componentIds.length} components</span>
                  <span>{profile.skillCount} skills</span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={selection.profileId === null}
            className="ib-profile ib-profile--empty"
            onClick={() => chooseProfile(null)}
          >
            <span className="ib-profile__name u-mono">no profile</span>
            <span className="ib-profile__desc">
              Start from nothing and assemble the selection component by component. Every choice
              becomes a --with flag.
            </span>
            <span className="ib-profile__meta">
              <span>0 modules requested</span>
            </span>
          </button>
        </div>
      </section>

      {/* Step 2 — target */}
      <section className="ib-step" aria-labelledby="ib-step-target">
        <div className="ib-step__head">
          <span className="ib-step__num" aria-hidden="true">
            2
          </span>
          <div>
            <h2 className="t-h3" id="ib-step-target">
              Choose the harness
            </h2>
            <p className="t-small u-muted">
              The value of --target. Each module declares the harnesses it supports; anything the
              target does not support is dropped from the plan rather than installed badly.
            </p>
          </div>
        </div>

        <div className="ib-targets" role="group" aria-label="Install target">
          {data.targets.map((target) => (
            <button
              key={target.id}
              type="button"
              aria-pressed={selection.target === target.id}
              className="ib-target"
              onClick={() => setSelection((current) => ({ ...current, target: target.id }))}
            >
              <span className="ib-target__name u-mono">{target.id}</span>
              <span className="ib-target__desc">{target.description}</span>
              <span className="ib-target__meta">{target.moduleCount} modules available</span>
            </button>
          ))}
        </div>
      </section>

      {/* Step 3 — refine */}
      <section className="ib-step" aria-labelledby="ib-step-refine">
        <div className="ib-step__head">
          <span className="ib-step__num" aria-hidden="true">
            3
          </span>
          <div>
            <h2 className="t-h3" id="ib-step-refine">
              Refine the selection
            </h2>
            <p className="t-small u-muted">
              {data.totals.components} install components, including one per skill directory.
              Checking something outside the profile adds a --with or --skills flag; unchecking
              something the profile brought in adds a --without flag.
            </p>
          </div>
        </div>

        <div className="ib-controls">
          <div className="search-field">
            <SearchIcon size={16} className="search-field__icon" />
            <label htmlFor="ib-search" className="visually-hidden">
              Search install components by ID or description
            </label>
            <input
              id="ib-search"
              type="search"
              className="search-field__input"
              placeholder="Search components and skills"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="filter-bar" role="group" aria-label="Filter by family">
            <button
              type="button"
              className="filter-chip"
              aria-pressed={familyFilter === null}
              onClick={() => setFamilyFilter(null)}
            >
              All <span className="u-subtle">{data.totals.components}</span>
            </button>
            {data.families.map((family) => (
              <button
                key={family.id}
                type="button"
                className="filter-chip"
                aria-pressed={familyFilter === family.id}
                onClick={() => setFamilyFilter(familyFilter === family.id ? null : family.id)}
              >
                {family.label} <span className="u-subtle">{family.count}</span>
              </button>
            ))}
            <button
              type="button"
              className="filter-chip"
              aria-pressed={selectedOnly}
              onClick={() => setSelectedOnly((value) => !value)}
            >
              Selected only <span className="u-subtle">{selectedIds.size}</span>
            </button>
          </div>

          <div className="ib-controls__row">
            <p className="result-count" role="status" aria-live="polite">
              {filtered.length} of {data.totals.components} components shown, {selectedIds.size}{' '}
              selected
            </p>
            {filtering && filtered.length > 0 ? (
              <span className="ib-bulk">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => setManyComponents(filtered.map((entry) => entry.id), true)}
                >
                  Add {filtered.length} shown
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => setManyComponents(filtered.map((entry) => entry.id), false)}
                >
                  Remove shown
                </button>
              </span>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No component matches that filter</p>
            <p className="t-small">
              Try a shorter query, or clear the family chip to search all{' '}
              {data.totals.components} components.
            </p>
          </div>
        ) : (
          <div
            className="ib-list"
            ref={scrollRef}
            onScroll={onScroll}
            tabIndex={0}
            role="group"
            aria-label={`Install components, ${filtered.length} shown`}
          >
            <div className="ib-list__sizer" style={{ height: totalHeight }}>
              {visibleRows.map((row, index) => {
                const top = offsets[startIndex + index];
                if (row.kind === 'group') {
                  return (
                    <div
                      key={row.key}
                      className="ib-list__group"
                      style={{ top, height: row.height }}
                      aria-hidden="true"
                    >
                      {row.label}
                      <span className="u-subtle"> {row.count}</span>
                    </div>
                  );
                }

                const component = row.component;
                const hooksBlocked = selection.hooks === 'none' && component.id === HOOKS_COMPONENT;
                const checked = selectedIds.has(component.id) && !hooksBlocked;
                const fromProfile = baseline.has(component.id);

                return (
                  <label
                    key={row.key}
                    className="ib-row"
                    style={{ top, height: row.height }}
                    data-checked={checked ? 'true' : 'false'}
                  >
                    <input
                      type="checkbox"
                      className="ib-row__box"
                      checked={checked}
                      disabled={hooksBlocked}
                      onChange={() => toggleComponent(component.id)}
                    />
                    <span className="ib-row__text">
                      <span className="ib-row__id u-mono">
                        {component.id}
                        {fromProfile ? (
                          <span className="ib-row__tag">profile</span>
                        ) : null}
                        {hooksBlocked ? <span className="ib-row__tag">--no-hooks</span> : null}
                      </span>
                      <span className="ib-row__desc">{component.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Step 4 — hooks */}
      <section className="ib-step" aria-labelledby="ib-step-hooks">
        <div className="ib-step__head">
          <span className="ib-step__num" aria-hidden="true">
            4
          </span>
          <div>
            <h2 className="t-h3" id="ib-step-hooks">
              Decide on the hook runtime
            </h2>
            <p className="t-small u-muted">
              The installer refuses to materialize hooks without consent. Choosing none emits
              --no-hooks. The other three are runtime profiles read from FORGE_HOOK_PROFILE, so
              they arrive as an exported variable alongside --enable-hooks.
            </p>
          </div>
        </div>

        <div className="ib-hooks" role="group" aria-label="Hook profile">
          {hookChoices.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={selection.hooks === choice}
              className="ib-hook"
              onClick={() => setSelection((current) => ({ ...current, hooks: choice }))}
            >
              <span className="u-mono">{choice}</span>
              <span className="ib-hook__note">
                {choice === 'none'
                  ? '--no-hooks'
                  : choice === defaultHooks
                    ? 'default'
                    : `FORGE_HOOK_PROFILE=${choice}`}
              </span>
            </button>
          ))}
        </div>

        <label className="ib-switch">
          <input
            type="checkbox"
            checked={selection.dryRun}
            onChange={(event) =>
              setSelection((current) => ({ ...current, dryRun: event.target.checked }))
            }
          />
          <span>
            Add --dry-run to print the resolved plan without writing files. Run this first.
          </span>
        </label>
      </section>

      {/* Plan summary */}
      <section className="ib-step" aria-labelledby="ib-step-plan">
        <div className="ib-step__head">
          <span className="ib-step__num" aria-hidden="true">
            5
          </span>
          <div>
            <h2 className="t-h3" id="ib-step-plan">
              What this installs
            </h2>
            <p className="t-small u-muted">
              Resolved from the manifests with the same dependency-first walk the installer uses.
              Adapter-level probes only run locally, so treat --dry-run as authoritative.
            </p>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat">
            <span className="stat__value">{plan.skillCount}</span>
            <span className="stat__label">skills</span>
          </div>
          <div className="stat">
            <span className="stat__value">{plan.moduleIds.length}</span>
            <span className="stat__label">modules</span>
          </div>
          <div className="stat">
            <span className="stat__value">{selectedIds.size}</span>
            <span className="stat__label">components</span>
          </div>
          <div className="stat">
            <span className="stat__value">{plan.pathCount}</span>
            <span className="stat__label">source paths</span>
          </div>
        </div>

        {warnings.length > 0 ? (
          <ul className="ib-warnings">
            {warnings.map((warning) => (
              <li key={warning} className="ib-warning">
                <AlertIcon size={15} />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ib-ok">
            <InfoIcon size={15} />
            <span>
              {exactProfile
                ? `The selection matches the ${exactProfile.id} profile exactly, so the command collapses to a single --profile flag.`
                : `${command.addedIds.length} added and ${command.removedIds.length} removed against the profile baseline.`}
            </span>
          </p>
        )}
      </section>

      {/* Sticky command bar */}
      <div className="ib-bar" ref={barRef}>
        <div className="container ib-bar__inner">
          <div className="ib-bar__command">
            {envLine ? <code className="ib-bar__env">{envLine}</code> : null}
            <code className="ib-bar__code" title={commandLine}>
              <span className="ib-bar__prompt" aria-hidden="true">
                ${' '}
              </span>
              {commandLine}
            </code>
          </div>
          <div className="ib-bar__actions">
            <span className="ib-bar__count">
              {plan.skillCount} skills / {plan.moduleIds.length} modules
            </span>
            <button type="button" className="btn btn--primary btn--sm" onClick={copy}>
              {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button type="button" className="btn btn--sm" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>
        <span role="status" aria-live="polite" className="visually-hidden">
          {copied ? 'Install command copied to clipboard' : ''}
        </span>
      </div>
    </div>
  );
}

/** Rendered into the static export while the query-string state hydrates. */
export function InstallBuilderSkeleton() {
  return (
    <div className="ib-skeleton" role="status" aria-live="polite">
      <p className="t-small u-muted">Loading the install manifests.</p>
    </div>
  );
}
