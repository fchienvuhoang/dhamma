import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function normalizeTransferText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const campaigns = [
  {
    code: "cntt10",
    name: "Cúng dường y áo chư Tăng chùa Tam Tạng 10",
    description: "Nhóm thiện pháp CNTT10.",
    keywords: ["cntt10", "chua tam tang 10", "tam tang 10"],
  },
  {
    code: "kathina-pm",
    name: "Dâng y Kathina PM",
    description: "Thiện pháp dâng y Kathina với nội dung thường gặp Kathina PM.",
    keywords: ["kathina pm", "kathina"],
  },
  {
    code: "vi-dieu-phap",
    name: "Xây dựng giảng đường Vi Diệu Pháp",
    description: "Các khoản cúng dường cho giảng đường Vi Diệu Pháp.",
    keywords: ["vi dieu phap", "giang duong vi dieu phap"],
  },
];

for (const campaign of campaigns) {
  const saved = await prisma.campaign.upsert({
    where: { code: campaign.code },
    update: {
      name: campaign.name,
      description: campaign.description,
      status: "ACTIVE",
    },
    create: {
      code: campaign.code,
      name: campaign.name,
      description: campaign.description,
      status: "ACTIVE",
    },
  });

  for (const keyword of campaign.keywords) {
    await prisma.campaignKeyword.upsert({
      where: {
        campaignId_normalizedKeyword_matchType: {
          campaignId: saved.id,
          normalizedKeyword: normalizeTransferText(keyword),
          matchType: "CONTAINS",
        },
      },
      update: {
        keyword,
        active: true,
      },
      create: {
        campaignId: saved.id,
        keyword,
        normalizedKeyword: normalizeTransferText(keyword),
        matchType: "CONTAINS",
        active: true,
      },
    });
  }
}

await prisma.$disconnect();
