import { redirect } from "next/navigation";

export default async function WorkshopHomePage({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  redirect(`/partner-portal/${partnerId}/dashboard`);
}
