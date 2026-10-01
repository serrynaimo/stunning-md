import { createChatHandler } from "@/stunning-md/server"

const url = process.env.STUNNING_MD_CHAT_URL
const model = process.env.STUNNING_MD_CHAT_MODEL
const apiKey = process.env.STUNNING_MD_CHAT_KEY

export const POST = createChatHandler({ url, model, apiKey })

/** Tells the page whether a chat model is set up on the server — never what it is. */
export function GET() {
  return Response.json({ configured: Boolean(url) })
}
