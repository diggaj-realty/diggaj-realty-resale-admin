import { authenticate } from '@/lib/api/auth'
import { ok, withApi, ApiError } from '@/lib/api/http'
import {
  getSellerDashboard,
  getBuyerDashboard,
  getAgentDashboard,
  getBackendDashboard,
  getAdminDashboard,
} from '@/lib/data/dashboard'

/** Role-appropriate stats/pipeline summary — same data backing both the
 *  dashboard home and the Performance page in the internal admin UI. */
export const GET = withApi(async (req) => {
  const user = await authenticate(req)

  switch (user.role) {
    case 'SELLER':
      return ok(await getSellerDashboard(user.id))
    case 'BUYER':
      return ok(await getBuyerDashboard(user.id))
    case 'AGENT':
      return ok(await getAgentDashboard(user.id))
    case 'BACKEND':
      return ok(await getBackendDashboard())
    case 'ADMIN':
      return ok(await getAdminDashboard())
    default:
      throw new ApiError('Unknown role', 400)
  }
})
