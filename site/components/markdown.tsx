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
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import type { Pluggable } from 'unified';

import { getHighlighter, SHIKI_THEMES } from '@/lib/highlighter';
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
  };

  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, autolinkOptions], shikiPlugin]}
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
