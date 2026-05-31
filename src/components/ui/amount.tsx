import * as React from "react";
import { cn } from "@/lib/utils";

interface AmountProps {
  value: number;
  currency?: string;
  showSign?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Amount({ 
  value, 
  currency = '₹', 
  showSign = false,
  className,
  size = 'md'
}: AmountProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const displayValue = Math.abs(value);

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  const formattedValue = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(displayValue);

  return (
    <span
      className={cn(
        'font-mono tabular-nums font-medium',
        sizeClasses[size],
        isPositive && 'text-success',
        isNegative && 'text-destructive',
        !isPositive && !isNegative && 'text-muted-foreground',
        className
      )}
    >
      {showSign && isPositive && '+'}
      {showSign && isNegative && '-'}
      {currency}{formattedValue}
    </span>
  );
}

interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  currency?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function AmountInput({ 
  value, 
  onChange, 
  currency = '₹', 
  placeholder = '0.00', 
  className, 
  disabled = false 
}: AmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9.]/g, '');
    const numValue = parseFloat(rawValue) || 0;
    onChange(numValue);
  };

  return (
    <div className={cn('relative', className)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
        {currency}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value > 0 ? value.toString() : ''}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2',
          'font-mono tabular-nums text-right',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'placeholder:text-muted-foreground'
        )}
      />
    </div>
  );
}
