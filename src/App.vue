<script setup>
import { ref, onMounted } from 'vue'
import ArticleCard from './components/ArticleCard.vue'

const loading = ref(false)
const error = ref('')
const articles = ref([])

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
    const base = import.meta.env.BASE_URL || './'
    const url = `${base.replace(/\/$/, '')}/data/education.json?d=${Date.now()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const json = await res.json()
    articles.value = json.items
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(loadFeed)
</script>

<template>
  <main class="container">
    <header class="topbar">
      <h1>NYTimes Education · Vue</h1>
      <button @click="loadFeed" :disabled="loading">Refresh</button>
    </header>

    <p v-if="error" class="error">Error: {{ error }}</p>
    <p v-else-if="loading">Loading…</p>
    <p v-else-if="!articles.length">No education articles available right now.</p>

    <section class="grid">
      <ArticleCard v-for="a in articles" :key="a.guid || a.link" :article="a" :format-date="formatDate" />
    </section>
  </main>
</template>


<style scoped>
.container { max-width: 1000px; margin: 0 auto; padding: 1rem; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.controls { display: flex; gap: .5rem; align-items: center; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-top: 1rem; }
.error { color: #b00020; }
select, input, button { padding: .5rem .6rem; }
article { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background:#fff; }
figure { margin: 0; height: 180px; overflow: hidden; background: #f6f7f8; display: flex; align-items: center; justify-content: center; }
figure img { width: 100%; object-fit: cover; height: 100%; }
.card-body { padding: .75rem .9rem; display: grid; gap: .4rem; }
.title { font-weight: 700; line-height: 1.2; }
.meta { font-size: .85rem; color: #555; }
.summary { color: #333; }
.link { text-decoration: underline; }
</style>
