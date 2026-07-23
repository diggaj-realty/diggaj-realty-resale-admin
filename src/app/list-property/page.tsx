import { redirect } from 'next/navigation'

/** Canonical URL is now list.diggajrealty.com — a dedicated custom domain on
 *  this same Vercel project, replacing the old diggajrealty.com/list-property
 *  cross-project rewrite (which was flaky and also inherited stale DNS
 *  caching issues from that domain's WordPress-to-Vercel migration). Anyone
 *  with this old link bookmarked gets forwarded there instead of a dead end. */
export default function PublicListingRedirect() {
  redirect('https://list.diggajrealty.com/')
}
