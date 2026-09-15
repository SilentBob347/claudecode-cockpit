import Link from 'next/link';

type Breadcrumb = { name: string; href: string };

/** Keep the visible trail and structured data identical; omit virtual sections. */
export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `https://opencockpit.dev${item.href}`,
    })),
  };
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
      }} />
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={item.href} className="inline-flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {index === items.length - 1
              ? <span aria-current="page">{item.name}</span>
              : <Link href={item.href} className="hover:text-brand">{item.name}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
