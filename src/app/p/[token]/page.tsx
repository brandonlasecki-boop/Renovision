import { notFound } from "next/navigation";
import { getPublicProjectData } from "@/lib/data/public-project";
import { PublicProjectView } from "@/components/public/public-project-view";
import { isUuid } from "@/lib/is-uuid";

export default async function PublicProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isUuid(token)) {
    notFound();
  }

  const result = await getPublicProjectData(token);
  if (!result) {
    notFound();
  }

  return <PublicProjectView payload={result.data} photos={result.photos} />;
}
