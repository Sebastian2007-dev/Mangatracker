export function buildChapterUrl(template: string, chapter: number): string {
  // Sites that use sub-chapters encode them with a dash (e.g. 62-1), not a dot
  const chapterStr = Number.isInteger(chapter) ? String(chapter) : String(chapter).replace('.', '-')
  return template.replace(/\$chapter/g, chapterStr)
}
