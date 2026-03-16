import type { Manga } from '../types/index'
import { normalizeTagList } from '../../../shared/statistics'
import { getBridge } from './platform'

type ApiDetails = {
  description: string
  status: string | null
  type: string | null
  latestChapter: number | null
  tags: string[]
  authors: string[]
  year: number | null
  demographic: string | null
}

type ApiResponse = {
  success: boolean
  data?: ApiDetails
}

export type LinkedMangaDetails = ApiDetails & {
  sources: string[]
}

function mergeUniqueTextLists(...lists: Array<string[] | null | undefined>): string[] {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const list of lists) {
    for (const rawEntry of list ?? []) {
      const entry = rawEntry.trim()
      if (!entry) continue

      const key = entry.toLowerCase()
      if (seen.has(key)) continue

      seen.add(key)
      merged.push(entry)
    }
  }

  return merged
}

export function mergeTagLists(...lists: Array<string[] | null | undefined>): string[] {
  return normalizeTagList(mergeUniqueTextLists(...lists))
}

export function areTagListsEqual(left: string[] | null | undefined, right: string[] | null | undefined): boolean {
  const normalizedLeft = mergeTagLists(left)
  const normalizedRight = mergeTagLists(right)
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((tag, index) => tag === normalizedRight[index])
}

export async function fetchLinkedMangaDetails(
  manga: Pick<Manga, 'mangaDexId' | 'comickHid'>
): Promise<LinkedMangaDetails | null> {
  const [ckRes, mdxRes] = await Promise.allSettled([
    manga.comickHid
      ? (getBridge().invoke('comick:details', { hid: manga.comickHid }) as Promise<ApiResponse>)
      : Promise.resolve(null),
    manga.mangaDexId
      ? (getBridge().invoke('mangadex:details', { id: manga.mangaDexId }) as Promise<ApiResponse>)
      : Promise.resolve(null)
  ])

  const ck = ckRes.status === 'fulfilled' && ckRes.value?.success ? (ckRes.value.data ?? null) : null
  const mdx = mdxRes.status === 'fulfilled' && mdxRes.value?.success ? (mdxRes.value.data ?? null) : null
  if (!ck && !mdx) return null

  return {
    description: mdx?.description || ck?.description || '',
    status: ck?.status ?? mdx?.status ?? null,
    type: ck?.type ?? mdx?.type ?? null,
    latestChapter: ck?.latestChapter ?? null,
    tags: mergeTagLists(ck?.tags, mdx?.tags),
    authors: mergeUniqueTextLists(ck?.authors, mdx?.authors),
    year: ck?.year ?? mdx?.year ?? null,
    demographic: mdx?.demographic ?? null,
    sources: [...(ck ? ['ComicK'] : []), ...(mdx ? ['MangaDex'] : [])]
  }
}