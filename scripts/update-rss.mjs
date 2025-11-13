import fs from 'node:fs/promises'
import path from 'node:path'
import Parser from 'rss-parser'

const FEEDS = {
  education: 'https://rss.nytimes.com/services/xml/rss/nyt/Education.xml'
}

const parser = new Parser({
  customFields: { item: [ ['media:content', 'mediaContent', { keepArray: true }] ] }
})

function coerceImage(item) {
  const mc = item.mediaContent?.find?.(m => m.$?.url)
  if (mc?.$?.url) return mc.$.url
  if (item.enclosure?.url) return item.enclosure.url
  const m = /<img[^>]+src=\"([^\"]+)\"/i.exec(item['content:encoded'] || '')
  return m ? m[1] : null
}

function shape(feedKey, parsed) {
  return {
    feed: feedKey,
    title: parsed.title,
    updatedAt: new Date().toISOString(),
    items: (parsed.items || []).map(it => ({
      title: it.title || '',
      link: it.link || '',
      guid: it.guid || it.link || '',
      pubDate: it.isoDate || it.pubDate || null,
      summary: it.contentSnippet || it.content || '',
      source: 'The New York Times',
      image: coerceImage(it)
    }))
  }
}

const outDir = path.join(process.cwd(), 'public', 'data')
await fs.mkdir(outDir, { recursive: true })

for (const [key, url] of Object.entries(FEEDS)) {
  const parsed = await parser.parseURL(url)
  const data = shape(key, parsed)
  const file = path.join(outDir, `${key}.json`)
  await fs.writeFile(file, JSON.stringify(data, null, 2))
  console.log('Wrote', file, data.items.length, 'items')
}
