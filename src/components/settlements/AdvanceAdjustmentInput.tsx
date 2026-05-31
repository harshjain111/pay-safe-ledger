import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Amount } from '@/components/ui/amount';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Info, AlertTriangle, ArrowRight } from 'lucide-react';
import { cn, toAmount } from '@/lib/utils';

interface AdvanceAdjustmentInputProps {
  totalAdvanceOutstanding: number;
  grossSalary: number;
  adjustmentAmount: number;
  onAdjustmentChange: (amount: number) => void;
  disabled?: boolean;
}

export function AdvanceAdjustmentInput({
  totalAdvanceOutstanding,
  grossSalary,
  adjustmentAmount,
  onAdjustmentChange,
  disabled = false,
}: AdvanceAdjustmentInputProps) {
  const maxAdjustable = Math.min(totalAdvanceOutstanding, grossSalary);
  const remainingAdvance = totalAdvanceOutstanding - adjustmentAmount;
  const salaryAfterAdjustment = grossSalary - adjustmentAmount;

  const handleSliderChange = (values: number[]) => {
    onAdjustmentChange(values[0]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = toAmount(e.target.value);
    // Clamp value between 0 and maxAdjustable
    const clampedValue = Math.min(maxAdjustable, Math.max(0, value));
    onAdjustmentChange(clampedValue);
  };

  // Validation checks
  const isOverGrossSalary = adjustmentAmount > grossSalary;
  const isOverOutstanding = adjustmentAmount > totalAdvanceOutstanding;
  const hasError = isOverGrossSalary || isOverOutstanding;

  if (totalAdvanceOutstanding <= 0) {
    return (
      <Alert className="border-success/30 bg-success/10">
        <Info className="h-4 w-4 text-success" />
        <AlertDescription className="text-success">
          No outstanding advances to adjust for this staff member.
        </AlertDescription>
      </Alert>
    );
  }

  // When gross salary is 0, show a warning that advances cannot be adjusted
  if (grossSalary <= 0) {
    return (
      <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Advance Adjustment</Label>
          <Badge variant="outline" className="font-mono">
            Outstanding: ₹{totalAdvanceOutstanding.toLocaleString('en-IN')}
          </Badge>
        </div>
        
        <Alert className="border-warning/30 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            Cannot adjust advances when gross salary is ₹0. The full outstanding amount of ₹{totalAdvanceOutstanding.toLocaleString('en-IN')} will carry forward to the next month.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Salary After Adjustment</p>
            <Amount value={0} className="font-semibold" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Advance Carry Forward</p>
            <Amount 
              value={totalAdvanceOutstanding} 
              className="font-semibold text-warning"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Advance Adjustment</Label>
        <Badge variant="outline" className="font-mono">
          Outstanding: ₹{totalAdvanceOutstanding.toLocaleString('en-IN')}
        </Badge>
      </div>

      {/* Input field */}
      <div className="space-y-2">
        <Label htmlFor="advanceAdjustment" className="text-xs text-muted-foreground">
          Amount to adjust this month
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
          <Input
            id="advanceAdjustment"
            type="number"
            min="0"
            max={maxAdjustable}
            value={adjustmentAmount || ''}
            onChange={handleInputChange}
            disabled={disabled}
            className={cn(
              "pl-8 font-mono",
              hasError && "border-destructive focus-visible:ring-destructive"
            )}
            placeholder="0"
          />
        </div>
      </div>

      {/* Slider for quick adjustment */}
      {maxAdjustable > 0 && (
        <div className="space-y-2">
          <Slider
            value={[adjustmentAmount]}
            onValueChange={handleSliderChange}
            max={maxAdjustable}
            step={100}
            disabled={disabled}
            className="py-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>₹0</span>
            <span>Max: ₹{maxAdjustable.toLocaleString('en-IN')}</span>
          </div>
        </div>
      )}

      {/* Summary display */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Salary After Adjustment</p>
          <Amount 
            value={salaryAfterAdjustment} 
            className={cn(
              "font-semibold",
              salaryAfterAdjustment < 0 && "text-destructive"
            )} 
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Advance Carry Forward</p>
          <Amount 
            value={remainingAdvance} 
            className={cn(
              "font-semibold",
              remainingAdvance > 0 ? "text-warning" : "text-success"
            )}
          />
        </div>
      </div>

      {/* Flow visualization */}
      {adjustmentAmount > 0 && (
        <div className="flex items-center justify-center gap-2 py-2 bg-background/50 rounded-md text-sm">
          <span className="text-muted-foreground">Opening:</span>
          <span className="font-mono">₹{totalAdvanceOutstanding.toLocaleString('en-IN')}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-destructive font-mono">-₹{adjustmentAmount.toLocaleString('en-IN')}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Closing:</span>
          <span className={cn("font-mono font-medium", remainingAdvance > 0 ? "text-warning" : "text-success")}>
            ₹{remainingAdvance.toLocaleString('en-IN')}
          </span>
        </div>
      )}

      {/* Validation errors */}
      {hasError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {isOverGrossSalary && "Adjustment cannot exceed gross salary."}
            {isOverOutstanding && "Adjustment cannot exceed outstanding advance."}
          </AlertDescription>
        </Alert>
      )}

      {/* Info about carry forward */}
      {remainingAdvance > 0 && !hasError && (
        <Alert className="border-info/30 bg-info/10">
          <Info className="h-4 w-4 text-info" />
          <AlertDescription className="text-info text-xs">
            ₹{remainingAdvance.toLocaleString('en-IN')} will carry forward as opening advance balance for next month.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
