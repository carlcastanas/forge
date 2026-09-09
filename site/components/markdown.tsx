/**
 * Renders repository markdown.
 *
 * react-markdown + remark-gfm for the content, rehype-slug and
 * rehype-autolink-headings for linkable headings, and shiki for build-time syntax
 * highlighting. Links written for the repository are rewritten to site routes;
 * images resolve against the mirrored public asset tree and are dropped when the
 * file is not there.
 */
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import type { Pluggable } from 'unified';

import { getHighlighter, SHIKI_COLOR_REPLACEMENTS, SHIKI_THEMES } from '@/lib/highlighter';
import { resolveRepoImage, resolveRepoLink } from '@/lib/content';

const autolinkOptions = {
  behavior: 'append' as const,
  properties: { className: 'heading-anchor', 'aria-hidden': 'true', tabIndex: -1 },
  content: {
    type: 'element' as const,
    tagName: 'span',
    properties: {},
    children: [{ type: 'text' as const, value: '#' }],
  },
};

/** Minimal shape of the hast nodes react-markdown hands to a component. */
type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * True when a table row will still put something on the page: any text, or an
 * image whose source resolves against the mirrored asset tree.
 */
function rowHasContent(node: HastNode, sourcePath: string): boolean {
  if (node.type === 'text') return (node.value ?? '').trim().length > 0;
  if (node.tagName === 'img') {
    const src = node.properties?.src;
    return typeof src === 'string' && Boolean(resolveRepoImage(src, sourcePath));
  }
  return (node.children ?? []).some((child) => rowHasContent(child, sourcePath));
}

export type MarkdownProps = {
  /** Markdown body, frontmatter already stripped. */
  content: string;
  /** Repo-relative path of the source file, used to resolve relative links. */
  sourcePath?: string;
};

export async function Markdown({ content, sourcePath = '' }: MarkdownProps) {
  const highlighter = await getHighlighter();

  const shikiPlugin: Pluggable = () =>
    rehypeShikiFromHighlighter(highlighter, {
      themes: SHIKI_THEMES,
      colorReplacements: SHIKI_COLOR_REPLACEMENTS,
      defaultColor: false,
      fallbackLanguage: 'text',
      lazy: false,
      onError: () => {},
    });

  const components: Components = {
    a({ href, children, ...rest }) {
      const raw = typeof href === 'string' ? href : '';
      const resolved = resolveRepoLink(raw, sourcePath);

      if (/^https?:/i.test(resolved)) {
        return (
          <a href={resolved} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
          </a>
        );
      }
      if (resolved.startsWith('#') || !resolved.startsWith('/')) {
        return (
          <a href={resolved} {...rest}>
            {children}
          </a>
        );
      }
      return (
        <Link href={resolved} {...rest}>
          {children}
        </Link>
      );
    },

    img({ src, alt }) {
      const raw = typeof src === 'string' ? src : '';
      const resolved = resolveRepoImage(raw, sourcePath);
      if (!resolved) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={resolved} alt={alt ?? ''} loading="lazy" decoding="async" />;
    },

    table({ children, ...rest }) {
      return (
        <div className="table-wrap" role="region" aria-label="Table" tabIndex={0}>
          <table {...rest}>{children}</table>
        </div>
      );
    },

    /**
     * Repository READMEs lay out screenshot grids as raw HTML tables, one image
     * per cell, pointing at an upload host this site does not mirror. Those
     * images are dropped above, which used to leave the row behind as a blank
     * forty-pixel band inside an otherwise ordinary table. A row that renders
     * nothing renders nothing.
     */
    tr({ children, node, ...rest }) {
      if (node && !rowHasContent(node, sourcePath)) return null;
      return <tr {...rest}>{children}</tr>;
    },
  };

  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        /**
         * rehype-raw parses the HTML that repository markdown carries — the
         * comparison tables in the translated READMEs, and the centred blocks in
         * the guides. Without it react-markdown emits the tags as literal text.
         * Every document here is first-party repository content read off disk at
         * build time, so there is no untrusted HTML in this pipeline.
         */
        rehypePlugins={[
          rehypeRaw,
          rehypeSlug,
          [rehypeAutolinkHeadings, autolinkOptions],
          shikiPlugin,
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Shown when a source file is missing or empty mid-build. */
export function MissingContent({ repoPath }: { repoPath: string }) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">This page has no content yet</p>
      <p className="t-small">
        {repoPath
          ? `The site reads this page from ${repoPath} in the repository. That file is currently empty or absent.`
          : 'The source file for this page is currently empty or absent.'}
      </p>
    </div>
  );
}
