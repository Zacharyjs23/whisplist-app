export const DEFAULT_ALLOWED_HOSTS: string[] = process.env.ALLOWED_HOSTS
  ? process.env.ALLOWED_HOSTS.split(',')
      .map((h: string) => h.trim())
      .filter(Boolean)
  : ['amazon.com', 'paypal.me', 'cash.app', 'whisplist.app'];
