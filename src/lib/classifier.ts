import type { KeywordMatchType } from "@prisma/client";
import { normalizeTransferText } from "@/lib/text";

export type KeywordRule = {
  campaignId: string;
  campaignCode: string;
  campaignName: string;
  keyword: string;
  normalizedKeyword: string;
  matchType: KeywordMatchType;
};

export type ClassificationResult = {
  campaignId: string | null;
  matchedKeyword: string | null;
  status: "MATCHED" | "UNMATCHED";
};

export function classifyDescription(
  description: string,
  rules: KeywordRule[],
): ClassificationResult {
  const normalizedDescription = normalizeTransferText(description);
  const sortedRules = [...rules].sort((a, b) => {
    return b.normalizedKeyword.length - a.normalizedKeyword.length;
  });

  for (const rule of sortedRules) {
    if (matchesRule(description, normalizedDescription, rule)) {
      return {
        campaignId: rule.campaignId,
        matchedKeyword: rule.keyword,
        status: "MATCHED",
      };
    }
  }

  return {
    campaignId: null,
    matchedKeyword: null,
    status: "UNMATCHED",
  };
}

function matchesRule(rawDescription: string, normalizedDescription: string, rule: KeywordRule) {
  if (rule.matchType === "EXACT") {
    return normalizedDescription === rule.normalizedKeyword;
  }

  if (rule.matchType === "REGEX") {
    try {
      return (
        new RegExp(rule.keyword, "i").test(rawDescription) ||
        new RegExp(rule.normalizedKeyword, "i").test(normalizedDescription)
      );
    } catch {
      return false;
    }
  }

  return normalizedDescription.includes(rule.normalizedKeyword);
}
