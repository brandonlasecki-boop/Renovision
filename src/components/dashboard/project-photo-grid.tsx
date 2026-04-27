import Image from "next/image";
import { deleteProjectPhotoForm } from "@/lib/actions/photos";
import { Button } from "@/components/ui/button";
import type { ProjectPhoto } from "@/types";

type PhotoWithUrl = ProjectPhoto & { signedUrl: string };

export function ProjectPhotoGrid({
  projectId,
  photos,
}: {
  projectId: string;
  photos: PhotoWithUrl[];
}) {
  if (photos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        No photos yet. Upload site photos to build your client-facing gallery.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {photos.map((p) => (
        <li
          key={p.id}
          className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted"
        >
          <Image
            src={p.signedUrl}
            alt={p.caption ?? "Project photo"}
            fill
            sizes="(max-width: 640px) 50vw, 33vw"
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
            <form action={deleteProjectPhotoForm}>
              <input type="hidden" name="photo_id" value={p.id} />
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="storage_path" value={p.storage_path} />
              <Button type="submit" variant="secondary" size="sm" className="h-8 text-xs">
                Remove
              </Button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
