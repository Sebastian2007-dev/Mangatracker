import { CapacitorHttp } from '@capacitor/core'

/**
 * Natives HTTP (CapacitorHttp) für JSON-APIs auf Mobile.
 *
 * MangaDex leitet Requests mit Browser-User-Agent auf eine Bot-Challenge um
 * ("if this isn't a browser, don't send a browser UA") → in der WebView endet
 * das als 403. WebView-fetch() ignoriert einen gesetzten User-Agent-Header,
 * nativ wird der eigene User-Agent tatsächlich gesendet. Gleiches gilt für
 * MangaUpdates (eigener UA, kein CORS-Problem).
 */
const APP_USER_AGENT = 'MangaTracker/1.0 (personal hobby app)'

export type JsonResponse<T> = { ok: boolean; status: number; json: T }

export async function nativeJson<T>(
  url: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<JsonResponse<T>> {
  // Eckige Klammern encoden — java.net.URL ist da je nach Android-Version wählerisch
  const encoded = url.replace(/\[/g, '%5B').replace(/\]/g, '%5D')
  const res = await CapacitorHttp.request({
    method: opts.method ?? 'GET',
    url: encoded,
    headers: {
      'User-Agent': APP_USER_AGENT,
      Accept: 'application/json',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(opts.body !== undefined ? { data: opts.body } : {})
  })
  const json = (typeof res.data === 'string' ? safeParse(res.data) : res.data) as T
  return { ok: res.status >= 200 && res.status < 300, status: res.status, json }
}

export function mangaDexGet<T>(url: string): Promise<JsonResponse<T>> {
  return nativeJson<T>(url)
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
