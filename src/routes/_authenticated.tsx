import { createFileRoute, redirect } from '@tanstack/react-router'
import { getCurrentUser } from '#/server/auth/middleware'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    return { user }
  },
})
