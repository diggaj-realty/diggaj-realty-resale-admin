import { authenticate } from '@/lib/api/auth'
import { ok, withApi } from '@/lib/api/http'
import { runSavedSearchAlerts } from '@/lib/data/savedSearchAlerts'

/** Trigger the saved-search alert scan. ADMIN/BACKEND run a platform-wide scan
 *  (intended for a scheduler); a BUYER triggers a scan of only their own searches
 *  ("check for new matches now"). */
export const POST = withApi(async (req) => {
  const user = await authenticate(req, ['ADMIN', 'BACKEND', 'BUYER'])
  const scopeToSelf = user.role === 'BUYER'
  const result = await runSavedSearchAlerts(scopeToSelf ? user.id : undefined)
  return ok(result)
})
