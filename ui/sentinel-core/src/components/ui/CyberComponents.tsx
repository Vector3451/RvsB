import React from 'react';
import { cn } from '@/src/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}

export const GlassCard = ({ children, className, glow }: GlassCardProps) => {
  return (
    <div className={cn(
      "glass-panel rounded-xl overflow-hidden",
      glow && "shadow-[0_0_20px_rgba(0,218,243,0.08)]",
      className
    )}>
      {children}
    </div>
  );
};

export const Badge = ({ children, variant = 'primary', className }: { children: React.ReactNode, variant?: 'primary' | 'secondary' | 'outline', className?: string }) => {
  const variants = {
    primary: "bg-primary/20 text-primary border-primary/20",
    secondary: "bg-secondary/20 text-secondary border-secondary/20",
    outline: "border-outline-variant/30 text-on-surface-variant"
  };
  
  return (
    <span className={cn(
      "px-2 py-0.5 font-headline text-[10px] tracking-widest rounded uppercase border",
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
};

export const Button = ({ children, variant = 'primary', className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' }) => {
  const variants = {
    primary: "bg-primary text-on-primary shadow-[0_0_20px_rgba(0,218,243,0.3)] hover:brightness-110",
    secondary: "bg-secondary-container text-white shadow-[0_0_20px_rgba(255,82,95,0.3)] hover:brightness-110",
    outline: "border border-primary/30 text-primary hover:bg-primary/10",
    ghost: "text-on-surface-variant hover:text-primary hover:bg-primary/5"
  };

  return (
    <button 
      className={cn(
        "px-6 py-2 font-headline font-bold text-xs tracking-widest rounded transition-all active:scale-95 flex items-center justify-center gap-2",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
