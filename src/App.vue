<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import ArticleCard from './components/ArticleCard.vue'

const sources = [
  { key: 'all', label: 'All sources', file: 'education_all.json' },
  { key: 'nytimes', label: 'NYTimes' },
  { key: 'npr', label: 'NPR' },
  { key: 'bbc', label: 'BBC' },
  { key: 'edweek', label: 'Education Week' },
  { key: 'hechinger', label: 'Hechinger' },
  { key: 'insidehighered', label: 'Inside Higher Ed' },
  { key: 'wapo_local_ed', label: 'Washington Post (Local Ed)' },
  { key: 'guardian_edu', label: 'The Guardian (Education)' },
  { key: 'edsurge', label: 'EdSurge' }
]

const current = ref(localStorage.getItem('edu-source') || 'all')
const loading = ref(false)
const error = ref('')
const articles = ref([])
const q = ref('')

// NEW: date range
const startDate = ref('')  // 'YYYY-MM-DD'
const endDate   = ref('')  // 'YYYY-MM-DD'

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return articles.value
  return articles.value.filter(a =>
    (a.title || '').toLowerCase().includes(term) ||
    (a.summary || '').toLowerCase().includes(term) ||
    (a.source || '').toLowerCase().includes(term)
  )
})

// NEW: apply date range on top of text filter
const dateFiltered = computed(() => {
  if (!startDate.value && !endDate.value) return filtered.value
  const sd = startDate.value ? new Date(`${startDate.value}T00:00:00`) : null
  const ed = endDate.value   ? new Date(`${endDate.value}T23:59:59`)   : null
  return filtered.value.filter(a => {
    if (!a.pubDate) return false
    const d = new Date(a.pubDate)
    if (isNaN(d)) return false
    if (sd && d < sd) return false
    if (ed && d > ed) return false
    return true
  })
})

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })
}

async function loadFeed() {
  loading.value = true
  error.value = ''
  articles.value = []
  try {
    const base = (import.meta.env.BASE_URL || './').replace(/\/$/, '')
    const src = sources.find(s => s.key === current.value)
    const file = src?.file || `${current.value}.json`
    const url = `${base}/data/${file}?d=${Date.now()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} for ${url}`)
    const json = await res.json()
    articles.value = json.items || []
  } catch (e) {
    console.error(e)
    error.value = String(e.message || e)
  } finally {
    loading.value = false
  }
}

function setPreset(days) {
  // days=1 -> today; 7 -> last 7 days; etc.
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)
  startDate.value = start.toISOString().slice(0, 10)
  endDate.value = end.toISOString().slice(0, 10)
}

function clearDates() {
  startDate.value = ''
  endDate.value = ''
}

onMounted(loadFeed)
watch(current, (v) => { localStorage.setItem('edu-source', v); loadFeed() })
</script>

<template>
  <main class="container">
    <header class="topbar">
      <h1>Education News · Vue</h1>
      <div class="controls">
        <select v-model="current" title="Select source">
          <option v-for="s in sources" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>

        <input v-model="q" type="search" placeholder="Search…" />

        <!-- NEW: date range controls -->
        <input v-model="startDate" type="date" :max="endDate || undefined" title="Start date" />
        <input v-model="endDate" type="date" :min="startDate || undefined" title="End date" />

        <button @click="() => setPreset(1)"  :disabled="loading">Today</button>
        <button @click="() => setPreset(7)"  :disabled="loading">7d</button>
        <button @click="() => setPreset(30)" :disabled="loading">30d</button>
        <button @click="clearDates"          :disabled="loading">Clear</button>

        <button @click="loadFeed" :disabled="loading">Refresh</button>
      </div>
    </header>

    <p v-if="error" class="error">Error: {{ error }}</p>
    <p v-else-if="loading">Loading…</p>
    <p v-else-if="!dateFiltered.length">No articles for this selection.</p>

    <section class="grid">
      <ArticleCard
        v-for="a in dateFiltered"
        :key="a.guid || a.link"
        :article="a"
        :format-date="formatDate"
      />
    </section>
  </main>
</template>

<style scoped>
.container { max-width: 1100px; margin: 0 auto; padding: 1rem; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.controls { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-top: 1rem; }
.error { color: #b00020; }
select, input[type="search"], input[type="date"], button { padding: .45rem .6rem; }
</style>
