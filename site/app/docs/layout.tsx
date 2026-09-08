import { DocsNav } from '@/components/docs-nav';
import { getDocGroups } from '@/lib/content';

/**
 * Three columns at 1280px and up, two from 1024px, one below that — where the
 * sidebar is served by the header drawer instead. Pages render two grid children:
 * the content column and the on-this-page column.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const groups = getDocGroups().map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({ href: item.href, title: item.title })),
  }));

  return (
    <div className="container">
      <div className="docs-layout">
        <aside className="docs-sidebar">
          <DocsNav groups={groups} ariaLabel="Documentation" />
        </aside>
        {children}
      </div>
    </div>
  );
}
