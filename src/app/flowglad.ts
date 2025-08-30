// Placeholder Flowglad server initialization for SplitSmart AI
// TODO: After installing @flowglad/nextjs, export a configured FlowgladServer instance.

import { FlowgladServer } from '@flowglad/nextjs/server'

// Construct a FlowgladServer with non-throwing defaults so builds succeed without envs.
// At runtime, API methods that require a valid key will fail clearly if missing.
export const flowgladServer = new FlowgladServer({
  apiKey: process.env.FLOWGLAD_SECRET_KEY,
  baseURL: process.env.FLOWGLAD_BASE_URL,
  // For MVP we allow guest usage; replace with real auth-derived customer soon.
  getRequestingCustomer: async () => ({
    externalId: 'guest',
    name: 'Guest',
    email: 'guest@example.com',
  }),
})
