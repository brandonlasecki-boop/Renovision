import Image from "next/image";
import type { PublicPhotoView, PublicProjectPayload } from "@/types";

export function PublicProjectView({
  payload,
  photos,
}: {
  payload: PublicProjectPayload;
  photos: PublicPhotoView[];
}) {
  const { project, company, updates } = payload;
  const brand = company.brand_color ?? "#0f172a";
  const latest = updates[0];

  return (
    <div className="min-h-screen bg-muted/30">
      <header
        className="border-b border-border/80 bg-card/90 px-4 py-6 backdrop-blur sm:px-8"
        style={{ borderBottomColor: `${brand}22` }}
      >
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Project
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {project.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{company.name}</p>
          {company.tagline ? (
            <p className="mt-2 text-sm text-foreground/80">{company.tagline}</p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-8">
        {latest ? (
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Latest update
            </p>
            <h2 className="mt-2 text-lg font-semibold">{latest.title}</h2>
            {latest.note ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{latest.note}</p>
            ) : null}
            {latest.next_step ? (
              <p className="mt-3 text-sm">
                <span className="font-medium text-foreground">Next: </span>
                {latest.next_step}
              </p>
            ) : null}
            <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
              <span
                className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                title={`${latest.progress_percent}%`}
              >
                <span
                  className="block h-full rounded-full transition-all"
                  style={{
                    width: `${latest.progress_percent}%`,
                    backgroundColor: brand,
                  }}
                />
              </span>
              <span>{latest.progress_percent}%</span>
            </div>
          </section>
        ) : null}

        {photos.length > 0 ? (
          <section>
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">Photos</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {photos.map((p) => (
                <li
                  key={p.id}
                  className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm"
                >
                  <div className="relative aspect-[4/3] w-full bg-muted">
                    <Image
                      src={p.url}
                      alt={p.caption || "Project photo"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      unoptimized
                    />
                  </div>
                  {p.caption ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">{p.caption}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {updates.length > 1 ? (
          <section>
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">Timeline</h2>
            <ul className="space-y-4">
              {updates.map((u) => (
                <li
                  key={u.id}
                  className="rounded-lg border border-border/60 bg-card/80 px-4 py-3 text-sm"
                >
                  <p className="font-medium">{u.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleString()} · {u.progress_percent}%
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
