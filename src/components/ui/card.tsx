import * as React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;
export function Card({ className = "", ...props }: DivProps) {
  return <div className={`rounded-2xl border border-charcoal-700 bg-charcoal-900 shadow-premium ${className}`} {...props} />;
}
export function CardHeader({ className = "", ...props }: DivProps) {
  return <div className={`flex flex-col space-y-1.5 p-5 ${className}`} {...props} />;
}
export function CardTitle({ className = "", ...props }: DivProps) {
  return <h3 className={`font-semibold leading-none tracking-tight ${className}`} {...props} />;
}
export function CardContent({ className = "", ...props }: DivProps) {
  return <div className={`p-5 pt-0 ${className}`} {...props} />;
}
