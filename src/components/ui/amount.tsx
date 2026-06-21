import * as React from "react";
import { cn, toAmount } from "@/lib/utils";

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
  // Sanitise: null/undefined/NaN/Infinity/dust never reach the formatter.
  const v = toAmount(value);
  const isPositive = v > 0;
  const isNegative = v < 0;
  const displayValue = Math.abs(v);

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
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

export function AmountInput({
  value,
  onChange,
  currency = '₹',
  placeholder = '0.00',
  className,
  disabled = false,
  id,
  name,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: AmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Keep digits + a SINGLE decimal point, then normalise via toAmount (finite,
    // 2-decimal) so malformed/multi-dot input ("1.2.3") can't reach a money column.
    const cleaned = e.target.value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const single = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
    onChange(toAmount(single));
  };

  return (
    <div className={cn('relative', className)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
        {currency}
      </span>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        value={value > 0 ? String(toAmount(value)) : ''}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2',
          'font-mono tabular-nums text-right',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'placeholder:text-muted-foreground'
        )}
      />
    </div>
  );
}
