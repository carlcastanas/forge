---
name: internationalization
description: Message catalogs and extraction, ICU MessageFormat plurals and select, locale negotiation and fallback chains, Intl-based formatting, time zones, RTL layout, pseudo-localization, and the translation workflow. Use when adding a second locale, fixing broken plurals or dates, or preparing a codebase for translation.
metadata:
  origin: FORGE
---

# Internationalization

Internationalization is the engineering work that makes localization possible: no user-visible string baked into a component, no sentence assembled by concatenation, no date formatted by hand, no layout that assumes text flows left to right. Done means a build that can ship a new locale by adding a catalog file, with no code change, and a UI that survives a locale whose translations run substantially longer and are written right to left.

## When to activate

- Adding a second locale or a region variant, or plurals read wrong ("1 items")
- Dates render in the wrong order or the wrong time zone
- Strings are concatenated from fragments, or interpolated into sentence templates
- Preparing a codebase for a translation vendor, or layout breaks in German, Japanese, or Arabic
- User says "i18n", "l10n", "translation", "RTL", "pluralization", "locale"

## When NOT to use

- Screen-reader semantics, focus order, contrast — [accessibility](../accessibility/SKILL.md) and [frontend-a11y](../frontend-a11y/SKILL.md); `lang` and `dir` sit on the boundary and belong to both
- Typography scale, spacing tokens, component variants — [design-system](../design-system/SKILL.md)
- Currency arithmetic, tax, and rounding rules — a money-domain concern; this skill covers only display formatting
- Per-tenant locale defaults in a SaaS product — [multi-tenancy-patterns](../multi-tenancy-patterns/SKILL.md)

## Prerequisites

- A runtime with full ICU data. Node built with `small-icu` silently falls back to English formatting; verify with `node -e "console.log(new Intl.NumberFormat('de-DE').format(1234.5))"` and expect `1.234,5`
- An i18n library that speaks ICU MessageFormat and supports message extraction
- A catalog store translators can round-trip, and an agreed default and source locale (usually the same)

## Process

### 1. Externalize every user-visible string into a catalog

A message is addressed by a stable key and defined once in the source catalog. Keys are namespaced by feature and describe intent, not the current English wording — `checkout.cart.empty`, not `your_cart_is_empty`, because the wording will change and the key must not.

```json
{
  "checkout.cart.empty": {
    "defaultMessage": "Your cart is empty",
    "description": "Shown in place of the line-item list when the cart has no items."
  },
  "checkout.cart.itemCount": {
    "defaultMessage": "{count, plural, =0 {No items} one {# item} other {# items}}",
    "description": "Item count badge next to the cart icon. # renders the number."
  }
}
```

Extraction runs from the source, not from a hand-maintained list. The build scans for the message-definition call, emits the source catalog, and fails when a message is defined twice with different text or when a string appears in JSX without going through the catalog.

```bash
# Extract, then fail the build if the committed catalog is stale.
npx formatjs extract 'src/**/*.{ts,tsx}' --out-file locales/en.json --id-interpolation-pattern '[sha512:contenthash:base64:6]'
git diff --exit-code locales/en.json
```

### 2. Never concatenate, never template a sentence

Concatenation encodes English grammar into the code. Word order, agreement, and article choice differ by language, and a translator handed three fragments cannot reorder them.

```typescript
// Wrong: three untranslatable fragments and a word order fixed in code.
const a = t("deleted") + " " + count + " " + (count === 1 ? t("file") : t("files"));
// Wrong: the sentence shape is still in code; some languages need the count last, or a different case.
const b = `${t("deletedPrefix")} ${count} ${t("filesSuffix")}`;
// Right: one message, one key, all variation inside ICU where a translator can restructure it.
// files.deleted = "{count, plural, one {Deleted # file} other {Deleted # files}}"
const c = t("files.deleted", { count });
```

The same rule applies to punctuation, spacing, units, and any string a user reads — including `aria-label`, `title`, `alt`, placeholder text, validation messages, email subjects, push notifications, and error copy surfaced from the server. Server-produced messages must travel as a key plus arguments, not as an English sentence the client cannot translate.

### 3. Use ICU MessageFormat for every variable message

ICU puts grammatical variation inside the message, where the translator controls it.

```json
{
  "inbox.unread": "{count, plural, =0 {No unread messages} =1 {One unread message} other {# unread messages}}",
  "post.likes": "{count, plural, offset:1 one {You and # other liked this} other {You and # others liked this}}",
  "invite.received": "{gender, select, female {She invited you} male {He invited you} other {They invited you}}",
  "race.position": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} place",
  "upload.summary": "{count, plural, one {# file, {size, number, ::compact-short}} other {# files, {size, number, ::compact-short}}}",
  "signup.terms": "Read the <link>terms of service</link> before continuing."
}
```

`plural` handles counts with exact-value overrides. `offset:1` makes `#` the remainder. `select` branches on an enumerated value, never a boolean standing in for grammar. Ordinals use `selectordinal`, not `plural`. Number and date skeletons nest inside branches, and rich text stays as tags so markup never enters the translated body.

Plural categories are `zero`, `one`, `two`, `few`, `many`, `other`, and which of them a language uses is defined by CLDR, not by the developer. English uses `one` and `other`; Arabic uses all six; Japanese uses only `other`. Always provide `other` — it is the required fallback. Do not hand-write plural logic in application code; the source catalog carries English categories and translators supply the rest.

Two traps. `=0` matches the literal value zero and must come before keyword clauses; `zero` is a CLDR category that English does not use, so a `zero {}` clause in an English message will never match. And `#` inside a plural branch is the formatted number in the current locale — writing `{count}` there instead skips locale-aware digit grouping.

### 4. Negotiate the locale properly

Resolution order: an explicit user preference stored on the account, then a locale in the URL path or subdomain, then a cookie, then `Accept-Language`, then the application default. Never geolocation — a traveller is not a language change.

`Accept-Language` is a weighted list of BCP 47 tags. Match it against the set of locales actually shipped using a defined algorithm rather than string equality: lookup matching (RFC 4647) truncates subtags right to left, so `en-AU` falls back to `en`, and `zh-Hant-HK` falls back to `zh-Hant` then `zh`.

```typescript
// Node/browser: Intl.LocaleMatcher-style negotiation over the shipped set.
const SUPPORTED = ["en", "en-GB", "fr", "de", "ja", "ar", "zh-Hans", "pt-BR"] as const;
const DEFAULT = "en";

export function negotiate(header: string | undefined, userPref?: string): string {
  const requested = [userPref, ...parseAcceptLanguage(header)].filter(Boolean) as string[];
  // Intl.getCanonicalLocales normalizes case and subtag order before matching.
  for (const tag of Intl.getCanonicalLocales(requested)) {
    const parts = tag.split("-");
    while (parts.length) {                                   // truncate one subtag per step
      const hit = SUPPORTED.find((s) => s.toLowerCase() === parts.join("-").toLowerCase());
      if (hit) return hit;
      parts.pop();
    }
  }
  return DEFAULT;
}
```

Build a fallback chain rather than a single locale: `["pt-BR", "pt", "en"]`. A missing key in `pt-BR` resolves against `pt`, then the source locale, and renders the source text with a warning rather than the raw key. Emit a metric on every fallback so gaps are visible.

Region and language are separate axes. `en-GB` differs from `en-US` in date order and spelling but shares most messages; ship it as a delta over `en` rather than a full copy. Script matters too: `zh-Hans` and `zh-Hant` are not interchangeable.

### 5. Format with Intl, never by hand

Every formatter is locale-aware and belongs to ECMA-402. Construct them once and cache — instantiation dominates the cost.

```typescript
const dateFmt = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin",
});
dateFmt.format(new Date("2026-03-14T09:05:00Z"));      // 14.03.2026, 10:05

new Intl.NumberFormat("de-DE").format(1234567.891);     // 1.234.567,891
new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(1234); // ￥1,234
new Intl.NumberFormat("en-US", { notation: "compact" }).format(1234567);             // 1.2M

new Intl.RelativeTimeFormat("fr", { numeric: "auto" }).format(-1, "day");            // hier
new Intl.ListFormat("es", { style: "long", type: "conjunction" })
  .format(["rojo", "verde", "azul"]);                                                // rojo, verde y azul

// Sorting and search: never String.prototype.localeCompare defaults for user-facing sorts.
const coll = new Intl.Collator("sv", { sensitivity: "base", numeric: true });
["ä", "z", "a"].sort(coll.compare);                                                  // a, z, ä  (Swedish order)
```

Currency has a hard rule: the currency code is data, not a locale property. `de-DE` does not imply EUR — a German user viewing a USD invoice must see USD. Pass the currency explicitly and store minor units as integers; never format money by multiplying a float.

Time zones: store every instant as UTC (`timestamptz` in PostgreSQL, ISO 8601 with `Z` on the wire) and convert only at render, using an IANA zone identifier taken from the user's profile or `Intl.DateTimeFormat().resolvedOptions().timeZone`. Never store an offset like `+02:00` as a user's zone — it is wrong for half the year. Calendar-only values (a birthday, a public holiday) are dates without a zone and must not be converted at all; store them as `date`, not `timestamptz`. When a user picks a future meeting time, store the zone identifier alongside the instant, because zone rules change and the intended wall-clock time is the durable fact.

### 6. Support RTL as a layout property, not a translation

Arabic, Hebrew, Persian, and Urdu flow right to left. Mirroring is a CSS and DOM concern; the strings themselves need no special handling.

```html
<html lang="ar" dir="rtl">
```

Set both attributes from the negotiated locale, server-side, so the first paint is correct. Then use logical properties throughout — they flip automatically and eliminate every `[dir="rtl"]` override.

```css
.card {
  margin-inline-start: 1rem;   /* not margin-left */
  padding-inline: 1rem 1.5rem; /* start, end */
  border-inline-start: 2px solid var(--accent);
  text-align: start;           /* not left */
  inset-inline-start: 0;       /* not left: 0 */
}

/* Directional icons mirror; logos, media controls, and clocks do not. */
[dir="rtl"] .icon-chevron-forward { transform: scaleX(-1); }
```

Mixed-direction content needs bidi isolation, or a trailing punctuation mark or embedded LTR identifier will jump to the wrong end of the line. Wrap user-supplied or opposite-direction runs in an element with `dir="auto"`, or apply `unicode-bidi: isolate`. In plain-text contexts where no markup exists, use the Unicode isolate characters `U+2066`–`U+2069` rather than the deprecated embedding controls.

```html
<p>Signed in as <bdi dir="auto">محمد</bdi> (last seen <bdi dir="auto">2026-03-14</bdi>)</p>
```

Test RTL against a real locale with real translations. Flipping `dir` on English text finds layout bugs but misses shaping, line-breaking, and font-fallback problems.

### 7. Pseudo-localize to find bugs before translators do

Pseudo-localization generates a fake locale from the source catalog: accented characters that stay readable, padding that simulates expansion, and bracket markers that reveal where a string was truncated or concatenated.

```typescript
const MAP: Record<string, string> = { a: "à", e: "é", i: "î", o: "ö", u: "û", c: "ç", s: "š", t: "ţ" };

// "Your cart is empty" -> "[!! Ýöûŕ çàŕţ îš émpţý ~~~~~~~ !!]"
export function pseudo(msg: string): string {
  // Transform only the literal runs; ICU placeholders and tag names must survive intact.
  const body = msg.replace(/[^{}<>]+/g, (run) => run.replace(/[aeioucst]/gi, (ch) =>
    ch === ch.toUpperCase() ? (MAP[ch.toLowerCase()] ?? ch).toUpperCase() : MAP[ch] ?? ch));
  return `[!! ${body} ${"~".repeat(Math.ceil(body.length * 0.4))} !!]`; // 40% expansion budget
}
```

Budget for expansion: short UI strings can grow substantially in German and Finnish, while CJK contracts but needs more line height. Any element with a fixed width, a single-line truncation, or a tight button is a defect waiting for the first translated build. Ship the pseudo locale behind a query parameter and run visual regression against it in CI.

Missing brackets in a rendered screenshot mean a hardcoded string. Text overflowing its container means a layout that assumes English length.

### 8. Run the translation workflow as a pipeline

1. **Source of truth**: the source catalog is generated by extraction and committed. Translators never edit code; developers never edit translated catalogs by hand.
2. **Context**: every key carries a `description` and, where possible, a screenshot reference. A translator seeing the bare string `Open` cannot know whether it is a verb on a button or an adjective describing state. Note placeholder meanings and any character limit.
3. **Sync**: CI pushes the source catalog to the translation system on merge to the main branch and opens a pull request when translations return. Machine translation is acceptable as a first pass only when the string is marked as unreviewed and the UI is not legally or financially consequential.
4. **Review**: an in-context review pass on the pseudo or target build, not a spreadsheet. Reviewers need to see the string in place.
5. **CI checks**, all failing the build: the source catalog is fresh relative to the code; every locale parses as valid ICU with the same placeholder set as the source; no locale falls below the agreed key-coverage threshold; no translated catalog holds a key absent from the source; no hardcoded user-visible string appears in the diff.
6. **Release**: locale bundles load on demand, split per locale, so an English user never downloads Japanese. The default locale ships in the initial bundle.

```bash
# Placeholder-parity check: a translation that drops {count} breaks at runtime, not at build.
npx i18n-lint check --source locales/en.json --targets 'locales/*.json' --require-placeholder-parity
```

## Checklist

- [ ] No user-visible string literal in components, including `aria-label`, `alt`, `title`, and placeholders
- [ ] Keys namespaced by feature, stable across copy changes, each carrying a `description`
- [ ] Source catalog produced by extraction and verified fresh in CI
- [ ] No sentence built by concatenation or string interpolation
- [ ] Every count, gender, and ordinal expressed in ICU with an `other` branch
- [ ] Server errors travel as key plus arguments, not as prose
- [ ] Locale negotiated from user preference, URL, cookie, then `Accept-Language`; never geolocation
- [ ] BCP 47 matching with subtag truncation and an explicit fallback chain; fallbacks emit a metric
- [ ] All formatting via `Intl` with cached formatter instances; currency passed as data; money in integer minor units
- [ ] Instants stored UTC, rendered in an IANA zone; calendar dates stored as dates
- [ ] `lang` and `dir` set server-side; layout uses logical properties with no `[dir="rtl"]` override sheet
- [ ] Mixed-direction content isolated with `<bdi>`, `dir="auto"`, or Unicode isolates
- [ ] Pseudo-locale available and covered by visual regression with a 40 percent expansion budget
- [ ] CI enforces ICU validity, placeholder parity, key coverage, and no orphan keys
- [ ] Locale bundles split and loaded on demand; the default locale ships in the initial bundle

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "1 items" | Manual `n === 1` branch or a plural rule missing `one` | Move the count into an ICU plural message |
| Zero case reads oddly in English | `zero {}` clause used, which English never matches | Use `=0 {}` before the keyword clauses |
| Placeholder renders literally as `{count}` | Argument name mismatch between catalog and call site | Placeholder-parity check in CI |
| Number formats as English in production | Runtime built with `small-icu` | Ship full ICU data; assert at boot |
| Date is one day off for some users | Rendered in server local time, or a `date` stored as `timestamptz` | Store UTC, render in the user's IANA zone; keep calendar dates as `date` |
| Meeting shifts after a DST change | Stored as an offset instead of a zone identifier | Store the IANA zone alongside the instant |
| Amount shown with the wrong symbol | Currency inferred from the locale | Pass the currency code as data |
| Arabic UI mostly correct, some panels reversed | Hardcoded `left`/`right` in CSS | Convert to logical properties; delete the RTL override sheet |
| Trailing punctuation jumps to the wrong side | No bidi isolation around a mixed-direction run | Wrap in `<bdi>` or `dir="auto"`; use `U+2066`–`U+2069` in plain text |
| Buttons clip in German | Fixed widths sized to English | Pseudo-locale visual regression with an expansion budget |
| New locale needs a code change | Locale list hardcoded in components | Drive from the catalog directory and the supported-locale list |

## References

- Unicode CLDR: plural rules, locale data, language matching; ICU MessageFormat syntax (`plural`, `selectordinal`, `select`, skeletons)
- ECMA-402 Internationalization API: `DateTimeFormat`, `NumberFormat`, `RelativeTimeFormat`, `ListFormat`, `PluralRules`, `Collator`, `Locale`
- BCP 47 language tags; RFC 4647 language-tag matching; IANA Time Zone Database
- Unicode Standard Annex #9: Bidirectional Algorithm; CSS Logical Properties and Values; HTML `lang`, `dir`, and `bdi`
- [../accessibility/SKILL.md](../accessibility/SKILL.md), [../frontend-a11y/SKILL.md](../frontend-a11y/SKILL.md), [../frontend-patterns/SKILL.md](../frontend-patterns/SKILL.md), [../design-system/SKILL.md](../design-system/SKILL.md)
- [../react-patterns/SKILL.md](../react-patterns/SKILL.md), [../api-design/SKILL.md](../api-design/SKILL.md), [../error-handling/SKILL.md](../error-handling/SKILL.md)
