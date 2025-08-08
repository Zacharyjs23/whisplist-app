export const DEFAULT_ALLOWED_HOSTS: string[] = process.env.ALLOWED_HOSTS
  ? process.env.ALLOWED_HOSTS.split(',')
      .map((h: string) => h.trim())
      .filter(Boolean)
  : ['amazon.com', 'gofundme.com', 'venmo.com'];
