const LOCAL_SITE_URL = 'http://localhost:3000';

type SiteEnvironment = Record<string, string | undefined>;

export function getSiteUrl(environment: SiteEnvironment = process.env): URL {
  const configured = environment.NEXT_PUBLIC_SITE_URL?.trim();
  const candidate = configured || LOCAL_SITE_URL;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return new URL(LOCAL_SITE_URL);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return new URL(LOCAL_SITE_URL);
  }
  return new URL(url.origin);
}

export function siteUrlConfigured(environment: SiteEnvironment = process.env) {
  const configured = environment.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return false;
  return getSiteUrl(environment).origin !== LOCAL_SITE_URL || configured === LOCAL_SITE_URL;
}

export function publicSiteUrlConfigured(
  environment: SiteEnvironment = process.env,
) {
  if (!siteUrlConfigured(environment)) return false;
  const url = getSiteUrl(environment);
  return (
    url.protocol === 'https:' &&
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  );
}

export function absoluteSiteUrl(
  path: string,
  environment: SiteEnvironment = process.env,
) {
  return new URL(path.startsWith('/') ? path : `/${path}`, getSiteUrl(environment)).toString();
}

export function razorpayWebhookUrl(environment: SiteEnvironment = process.env) {
  return absoluteSiteUrl('/api/webhooks/razorpay', environment);
}
