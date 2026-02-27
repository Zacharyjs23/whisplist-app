type BuildCampaignShareMessageOptions = {
  creatorName?: string | null;
  wishTitle?: string | null;
  url: string;
};

function normalizeText(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function buildCampaignShareMessage({
  creatorName,
  wishTitle,
  url,
}: BuildCampaignShareMessageOptions): string {
  const safeCreator = normalizeText(creatorName);
  const safeTitle = normalizeText(wishTitle);
  if (safeCreator && safeTitle) {
    return `${safeCreator} is raising support on WhispList: "${safeTitle}". ${url}`;
  }
  if (safeTitle) {
    return `Support this WhispList request: "${safeTitle}". ${url}`;
  }
  return `Support this request on WhispList: ${url}`;
}
