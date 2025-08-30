import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { flowgladServer } from '@/app/flowglad'

// Delegate GET/POST to Flowglad handler.
const handler = createAppRouterRouteHandler(flowgladServer)
export const GET = handler
export const POST = handler
