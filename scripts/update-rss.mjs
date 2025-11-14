// scripts/update-rss.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import Parser from 'rss-parser'

const FEEDS = {
  nytimes: 'https://rss.nytimes.com/services/xml/rss/nyt/Education.xml',
  npr: 'https://feeds.npr.org/1013/rss.xml',
  bbc: 'https://feeds.bbci.co.uk/news/education/rss.xml?edition=uk',
  edweek: 'https://www.edweek.org/feed.rss',
  hechinger: 'https://hechingerreport.org/feed/',
  insidehighered: 'https://www.insidehighered.com/rss.xml',
  wapo_local_ed: 'https://feeds.washingtonpost.com/rss/local/education',
  guardian_edu: 'https://www.theguardian.com/education/rss',
  edsurge: 'https://www.edsurge.com/articles_rss'
}


const parser = new Parser()
const outDir = path.join(process.cwd(), 'public', 'data')
await fs.mkdir(outDir, { recursive: true })

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; EducationTrendsBot/1.0; +https://github.com/<your-username>/EducationTrends)',
  'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5'
}

async function fetchAndParse(url) {
  // Node 18+ has global fetch
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()
  // Parse from string to bypass network quirks
  return parser.parseString(xml)
}

function shapeItems(key, feed) {
  return (feed.items || []).map(it => ({
    sourceKey: key,
    source: feed.title || key,
    title: it.title || '',
    link: it.link || '',
    guid: it.guid || it.link || `${key}:${(it.title||'').slice(0,80)}`,
    pubDate: it.isoDate || it.pubDate || null,
    summary: it.contentSnippet || it.content || '',
    image: (it.enclosure && it.enclosure.url) || null
  }))
}

const allItems = []

for (const [key, url] of Object.entries(FEEDS)) {
  try {
    let feed
    try {
      // Preferred path: fetch+parseString with headers
      feed = await fetchAndParse(url)
    } catch (e1) {
      // Fallback: let rss-parser do the request
      feed = await parser.parseURL(url)
    }

    const items = shapeItems(key, feed)

    // write per-source json
    const srcFile = path.join(outDir, `${key}.json`)
    await fs.writeFile(srcFile, JSON.stringify({ feed: key, items }, null, 2))
    console.log(`Wrote ${srcFile} ${items.length} items`)

    allItems.push(...items)
  } catch (e) {
    console.error(`Failed ${key}: ${e.message}`)
  }
}

// combine + sort + dedupe by guid
const seen = new Set()
const combined = []
for (const it of allItems.sort((a,b) => new Date(b.pubDate||0)-new Date(a.pubDate||0))) {
  if (!it.guid || seen.has(it.guid)) continue
  seen.add(it.guid)
  combined.push(it)
}

const combinedFile = path.join(outDir, 'education_all.json')
await fs.writeFile(combinedFile, JSON.stringify({ feed: 'education_all', items: combined }, null, 2))
console.log(`Wrote ${combinedFile} ${combined.length} items`)
