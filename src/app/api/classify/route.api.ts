import { createClassifierHandler } from "@/stunning-md/server"

const url = process.env.STUNNING_MD_CLASSIFIER_URL
const apiKey = process.env.STUNNING_MD_CLASSIFIER_KEY

export const POST = createClassifierHandler({ url, apiKey })

/** Tells the page whether a classifier is set up on the server — never what it is. */
export function GET() {
  return Response.json({ configured: Boolean(url && apiKey) })
}
