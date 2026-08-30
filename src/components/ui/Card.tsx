import { cn } from "@/utils/cn";

export function Card(props: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        props.className,
      )}
      {...props}
    />
  );
}

export function CardHeader(
  props: React.HTMLAttributes<HTMLDivElement>,
): React.ReactElement {
  return <div className={cn("flex flex-col gap-1 p-4 pb-2", props.className)} {...props} />;
}

export function CardTitle(
  props: React.HTMLAttributes<HTMLHeadingElement>,
): React.ReactElement {
  return <h3 className={cn("text-sm font-semibold", props.className)} {...props} />;
}

export function CardContent(
  props: React.HTMLAttributes<HTMLDivElement>,
): React.ReactElement {
  return <div className={cn("p-4 pt-2 text-sm", props.className)} {...props} />;
}
