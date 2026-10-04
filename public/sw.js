// The service worker of a site whose chat requests are runs (see src/app/hermes.ts). The page
// tells it which runs it has started; it asks after each one and, if a run ends while nobody is
// looking at the site, shows a notification. It caches nothing and answers no requests.
//
// A service worker only lives while the browser keeps it alive: as long as a page of the site
// is running, and for a few minutes after the last one is closed. On a phone that has put the
// site to sleep it does not run at all, so the notification is for a site left in the background,
// not for a locked phone — there, the answer is simply on the page when it is opened again.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

const ENDED = new Set(["completed", "failed", "cancelled", "interrupted"])
const ASK_EVERY = 4000
const PATIENCE = 30 * 60 * 1000
/** The runs being followed by this worker right now. */
const following = new Set()
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function follow({ id, title, url }) {
  if (following.has(id)) return
  following.add(id)
  try {
    for (const until = Date.now() + PATIENCE; following.has(id) && Date.now() < until; ) {
      await pause(ASK_EVERY)
      let run
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "include" })
        if (response.status === 404) return
        if (!response.ok) continue
        run = await response.json()
      } catch {
        continue
      }
      if (!ENDED.has(run.status)) continue
      // Whoever is looking at the site sees the answer there.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      if (!following.has(id) || windows.some((client) => client.visibilityState === "visible")) return
      if (run.status === "completed" || run.status === "failed") {
        await self.registration.showNotification(run.status === "completed" ? "Your answer is ready" : "The request failed", {
          body: String(title || "").replace(/\s+/g, " ").slice(0, 120),
          tag: id,
          data: { url: self.registration.scope },
        })
      }
      return
    }
  } finally {
    following.delete(id)
  }
}

self.addEventListener("message", (event) => {
  const message = event.data || {}
  if (message.type === "follow" && typeof message.id === "string") {
    // Only this site's own runs: an address under the worker's scope.
    let url
    try {
      url = new URL(message.url, self.registration.scope).href
    } catch {
      return
    }
    if (url.startsWith(self.registration.scope)) event.waitUntil(follow({ id: message.id, title: message.title, url }))
  } else if (message.type === "seen" && typeof message.id === "string") {
    // The page showed the answer itself: stop asking, and take back a notification that is no longer news.
    following.delete(message.id)
    event.waitUntil(self.registration.getNotifications({ tag: message.id }).then((shown) => shown.forEach((notification) => notification.close())))
  }
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || self.registration.scope, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      const here = open.find((client) => client.url.startsWith(self.registration.scope))
      return here ? here.focus() : self.clients.openWindow(url)
    }),
  )
})
