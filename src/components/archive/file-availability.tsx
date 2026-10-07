import { Icon } from "@/components/ui/icon";

export function FileAvailability({
  hasPowerPoint,
  hasPdf,
}: {
  hasPowerPoint: boolean;
  hasPdf: boolean;
}) {
  if (!hasPowerPoint && !hasPdf)
    return (
      <p className="text-sm leading-6 text-muted">
        Slides are not yet available.
      </p>
    );
  return (
    <ul
      aria-label="Presentation file availability"
      className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted"
    >
      {hasPowerPoint && (
        <li className="inline-flex items-center gap-2">
          <Icon name="file" className="size-4 shrink-0" />
          PowerPoint uploaded
        </li>
      )}
      {hasPdf && (
        <li className="inline-flex items-center gap-2">
          <Icon name="file" className="size-4 shrink-0" />
          PDF uploaded
        </li>
      )}
    </ul>
  );
}
