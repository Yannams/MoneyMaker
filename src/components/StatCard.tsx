import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ScrollReveal } from '@/components/ScrollReveal';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
  delay?: number;
}

export const StatCard = ({ 
  title, 
  value, 
  icon, 
  subtitle, 
  trend,
  className,
  delay = 0 
}: StatCardProps) => {
  return (
    <ScrollReveal
      className={cn('h-full card-hover', className)}
      delayMs={delay * 90}
    >
      <div className="soft-panel h-full min-h-[190px] p-5 sm:p-6">
        <div className="flex h-full items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <p className="text-muted-foreground text-sm font-medium">{title}</p>
            <p className="text-2xl sm:text-3xl font-semibold text-foreground">{value}</p>
            {subtitle && (
              <p className={cn(
                "text-sm leading-relaxed",
                trend === 'up' && "text-primary",
                trend === 'down' && "text-destructive",
                trend === 'neutral' && "text-muted-foreground"
              )}>
                {subtitle}
              </p>
            )}
          </div>
          <div className="shrink-0 p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary">
            {icon}
          </div>
        </div>
      </div>
    </ScrollReveal>
  );
};
