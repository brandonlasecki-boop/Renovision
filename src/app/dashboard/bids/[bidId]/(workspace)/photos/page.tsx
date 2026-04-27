import { redirect } from "next/navigation";

/** Old photos route — merged into Site & plan. */
export default async function BidPhotosRedirectPage({
  params,
}: {
  params: Promise<{ bidId: string }>;
}) {
  const { bidId } = await params;
  redirect(`/dashboard/bids/${bidId}/setup`);
}
