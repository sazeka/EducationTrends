<script setup>
const props = defineProps({
  article: { type: Object, required: true },
  formatDate: { type: Function, required: true }
})
</script>

<template>
  <article>
    <figure v-if="article.image">
      <img :src="article.image" :alt="article.title || 'Article image'" loading="lazy" />
    </figure>
    <div class="card-body">
      <div class="title">{{ article.title }}</div>
      <div class="meta">
        <span v-if="article.pubDate">{{ formatDate(article.pubDate) }}</span>
        <span v-if="article.source"> · {{ article.source }}</span>
      </div>
      <p class="summary">{{ article.summary }}</p>
      <a class="link" :href="article.link" target="_blank" rel="noopener">Read on NYTimes →</a>
    </div>
  </article>
</template>

<style scoped>
article { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background:#fff; }
figure { margin: 0; height: 180px; overflow: hidden; background: #f6f7f8; display: flex; align-items: center; justify-content: center; }
figure img { width: 100%; object-fit: cover; height: 100%; }
.card-body { padding: .75rem .9rem; display: grid; gap: .4rem; }
.title { font-weight: 700; line-height: 1.2; }
.meta { font-size: .85rem; color: #555; }
.summary { color: #333; }
.link { text-decoration: underline; }
</style>
