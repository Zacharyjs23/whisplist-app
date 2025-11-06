type SafetyConfig = {
  emergencyNumber: string;
  emergencyUri: string;
  resourcesUri: string;
};

const DEFAULT_CONFIG: SafetyConfig = {
  emergencyNumber: '112',
  emergencyUri: 'tel:112',
  resourcesUri: 'https://www.opencounseling.com/suicide-hotlines',
};

const REGION_CONFIG: Record<string, SafetyConfig> = {
  US: {
    emergencyNumber: '911',
    emergencyUri: 'tel:911',
    resourcesUri: 'https://988lifeline.org/',
  },
  CA: {
    emergencyNumber: '911',
    emergencyUri: 'tel:911',
    resourcesUri: 'https://988.ca/',
  },
  GB: {
    emergencyNumber: '999',
    emergencyUri: 'tel:999',
    resourcesUri: 'https://www.samaritans.org/how-we-can-help/',
  },
  IE: {
    emergencyNumber: '112',
    emergencyUri: 'tel:112',
    resourcesUri: 'https://www.samaritans.org/ireland/samaritans-ireland/',
  },
  AU: {
    emergencyNumber: '000',
    emergencyUri: 'tel:000',
    resourcesUri: 'https://www.lifeline.org.au/',
  },
  NZ: {
    emergencyNumber: '111',
    emergencyUri: 'tel:111',
    resourcesUri: 'https://www.lifeline.org.nz/',
  },
  IN: {
    emergencyNumber: '112',
    emergencyUri: 'tel:112',
    resourcesUri: 'https://www.aasra.info/',
  },
  SG: {
    emergencyNumber: '995',
    emergencyUri: 'tel:995',
    resourcesUri: 'https://sos.org.sg/get-help/',
  },
  PH: {
    emergencyNumber: '911',
    emergencyUri: 'tel:911',
    resourcesUri: 'https://www.opencounseling.com/hotlines-ph',
  },
};

const normalizeRegion = (region?: string | null) => {
  if (!region) return '';
  return region.trim().toUpperCase();
};

export const getSafetyConfig = (region?: string | null): SafetyConfig => {
  const normalized = normalizeRegion(region);
  return REGION_CONFIG[normalized] ?? DEFAULT_CONFIG;
};

export type { SafetyConfig };
