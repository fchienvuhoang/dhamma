import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCampaignView } from "@/components/public-campaign-view";
import { getPublicCampaignData, getPublicCampaignMeta } from "@/lib/public-campaign";

type Props = {
  params: Promise<{
    code: string;
  }>;
};

export const revalidate = 30;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const data = await getPublicCampaignMeta(code);

  if (!data) {
    return {
      title: "Không tìm thấy thiện pháp",
    };
  }

  return {
    title: `${data.name} | Thiện pháp`,
    description: data.description ?? `Theo dõi thu chi thiện pháp ${data.code}.`,
  };
}

export default async function PublicCampaignPage({ params }: Props) {
  const { code } = await params;
  const data = await getPublicCampaignData(code);

  if (!data) {
    notFound();
  }

  return <PublicCampaignView data={data} />;
}
