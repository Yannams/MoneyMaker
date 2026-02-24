import { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

type BreadcrumbItem = {
  label: string;
  to?: string;
};

type PageHeadingProps = {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
};

export const PageHeading = ({ title, description, breadcrumb = [], actions, className }: PageHeadingProps) => {
  return (
    <section className={cn('space-y-4', className)}>
      {breadcrumb.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {breadcrumb.map((item, index) => (
            <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.to ? (
                <Link to={item.to} className="hover:text-foreground transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className="text-foreground/90">{item.label}</span>
              )}
              {index < breadcrumb.length - 1 ? <ChevronRight className="w-3 h-3 opacity-70" /> : null}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="section-heading">{title}</h1>
          {description ? <p className="section-caption">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
};

