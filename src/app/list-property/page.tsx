import { redirect } from 'next/navigation'

/** Canonical URL is now diggajrealty.com/list-property (which proxies to
 *  /embed/list-property on this app). Anyone with this old link bookmarked
 *  gets forwarded there instead of a dead end. */
export default function PublicListingRedirect() {
  redirect('https://diggajrealty.com/list-property')
}
