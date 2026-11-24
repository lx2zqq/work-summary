export function PageHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          {description}
        </p>
      ) : null}
    </div>
  );
}
