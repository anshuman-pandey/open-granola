import type { Person } from "../lib/types";

export function Avatar({ person, size = 28 }: { person: Person; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: person.color,
        fontSize: size * 0.36,
      }}
      title={person.name}
    >
      {person.initials}
    </div>
  );
}

export function AvatarStack({ people, max = 4 }: { people: Person[]; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((p) => (
        <div key={p.id} className="rounded-full ring-2 ring-card">
          <Avatar person={p} size={22} />
        </div>
      ))}
      {extra > 0 && (
        <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
          +{extra}
        </div>
      )}
    </div>
  );
}
