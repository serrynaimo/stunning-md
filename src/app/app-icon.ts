import { readFileSync } from "node:fs"

/**
 * The icon of a site installed to a phone's home screen, build-time and optional: a square PNG.
 * `NEXT_PUBLIC_APP_ICON` is its address, which a phone has to reach without a login. `APP_ICON_FILE`
 * is the file on the build machine: it is then written into the page and the manifest themselves, for
 * a site where nothing is reachable without a login, and the address is left to the browser's tab.
 */
const file = process.env.APP_ICON_FILE
const png = file ? readFileSync(file) : null

/** The browser tab's icon. */
export const tabIcon = process.env.NEXT_PUBLIC_APP_ICON
/** The home screen's icon. */
export const homeIcon = png ? `data:image/png;base64,${png.toString("base64")}` : tabIcon
/** Its side in pixels: a file says so in its header, an address is asked to be 512 px. */
export const homeIconSize = png ? png.readUInt32BE(16) : 512
