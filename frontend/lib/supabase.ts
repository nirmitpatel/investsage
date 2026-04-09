import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export const createClient = () => createClientComponentClient()

/** Returns the current auth token. In e2e tests, respects window.__E2E_TOKEN__. */
export async function getToken(): Promise<string | null> {
  if (typeof window !== 'undefined' && (window as any).__E2E_TOKEN__) {
    return (window as any).__E2E_TOKEN__ as string
  }
  const { data } = await createClientComponentClient().auth.getSession()
  return data.session?.access_token ?? null
}
