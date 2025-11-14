<script setup>
import { ref, onMounted } from 'vue'
import ArticleCard from './components/ArticleCard.vue'

const summaries = ref([])
const date = ref('')
const loading = ref(false)
const error = ref('')
const overview = ref({ headline: '', summary: '', bullets: [], tags: [] })

async function fetchSummaries(ymd = 'today') {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/api/summarize/${ymd}`)
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()

    summaries.value = (Array.isArray(data?.items) ? data.items : []).map(normalizeItem)
    overview.value = normalizeOverview(data?.overview)
    date.value = data?.date || (ymd === 'today' ? '' : ymd)
  } catch (e) {
    error.value = typeof e?.message === 'string' ? e.message : 'Failed to load summaries.'
    summaries.value = []
    overview.value = { headline: '', summary: '', bullets: [], tags: [] }
  } finally {
    loading.value = false
  }
}

function normalizeItem(item) {
  return {
    title: item?.title ?? '',
    source: item?.source ?? 'Unknown',
    url: item?.url ?? '',
    date: item?.date ?? '',
    summary: cleanText(item?.summary ?? ''),
    bullets: Array.isArray(item?.bullets) ? item.bullets : [],
    tags: Array.isArray(item?.tags) ? item.tags : []
  }
}

function normalizeOverview(o) {
  if (!o || typeof o !== 'object') return { headline: '', summary: '', bullets: [], tags: [] }
  return {
    headline: o.headline || '',
    summary: cleanText(o.summary || ''),
    bullets: Array.isArray(o.bullets) ? o.bullets : [],
    tags: Array.isArray(o.tags) ? o.tags : []
  }
}

function cleanText(text) {
  if (!text) return ''
  return String(text)
    .replace(/```+/g, '')                                     // strip code fences
    .replace(/^{\s*"title"\s*:\s*".*?"[\s\S]*?}\s*$/g, '')    // strip stray raw JSON
    .replace(/\s+/g, ' ')
    .trim()
}

onMounted(() => fetchSummaries('today'))

function refresh() {
  fetchSummaries(date.value || 'today')
}
</script>

<template>
  <main class="page">
    <header style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px">
      <h1 style="margin:0">AI Summaries for {{ date || 'Today' }}</h1>
      <div>
        <input type="date" :value="date" @change="e => fetchSummaries(e.target.value || 'today')" />
        <button @click="refresh" style="margin-left:8px">{{ loading ? 'Loading…' : 'Refresh' }}</button>
      </div>
    </header>

    <!-- GRAND DAILY SUMMARY -->
    <section v-if="overview.summary" class="overview">
      <h2 style="margin:0 0 6px">{{ overview.headline }}</h2>
      <p style="margin:0 0 10px">{{ overview.summary }}</p>
      <ul v-if="overview.bullets.length" style="margin:0 0 10px 18px">
        <li v-for="b in overview.bullets" :key="b">{{ b }}</li>
      </ul>
      <div class="tags" v-if="overview.tags.length">
        <span class="tag" v-for="t in overview.tags" :key="t">#{{ t }}</span>
      </div>
    </section>

    <section v-if="error" class="overview" style="border-color:#f3b1b1;background:#fff5f5;color:#b42318">
      ⚠️ {{ error }}
    </section>

    <!-- CARDS GRID -->
    <section v-else class="cards-grid">
      <ArticleCard v-for="it in summaries" :key="it.url || it.title" :item="it" />
    </section>
  </main>
</template>


<style scoped>
/* minimal; utility classes handle most styling */
</style>
