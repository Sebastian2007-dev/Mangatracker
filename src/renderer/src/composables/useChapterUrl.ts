export function buildChapterUrl(template: string, chapter: number): string {
  return template.replace(/\$chapter/g, String(chapter))
}
