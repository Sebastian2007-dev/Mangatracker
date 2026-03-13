import { Preferences } from '@capacitor/preferences'

const SESSION_KEY = 'reading-session'

export type ReadingSession = {
  mangaId: string
  title: string
  chapter: number
}

export async function setReadingSession(session: ReadingSession): Promise<void> {
  await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) })
}

export async function clearReadingSession(): Promise<void> {
  await Preferences.remove({ key: SESSION_KEY })
}

export async function getReadingSession(): Promise<ReadingSession | null> {
  const { value } = await Preferences.get({ key: SESSION_KEY })
  if (!value) return null
  try {
    return JSON.parse(value) as ReadingSession
  } catch {
    return null
  }
}
