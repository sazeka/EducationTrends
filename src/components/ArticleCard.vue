<script setup>
import { computed } from 'vue'

const props = defineProps({
  item: { type: Object, required: true }
})

const hostname = computed(() => {
  try { return props.item?.url ? new URL(props.item.url).hostname : '' } catch { return '' }
})

const displayDate = computed(() => {
  try { return props.item?.date ? new Date(props.item.date).toLocaleDateString() : '' } catch { return '' }
})

function clean(t) {
  if (!t) return ''
  return String(t).replace(/```+/g,'').replace(/^{\s*"title"\s*:\s*".*?"[\s\S]*?}\s*$/g,'').replace(/\s+/g,' ').trim()
}
</script>

<template>
  <article class="card">
    <h3>
      <a v-if="item.url" :href="item.url" target="_blank" rel="noopener">{{ item.title || 'Untitled' }}</a>
      <span v-else>{{ item.title || 'Untitled' }}</span>
    </h3>

    <div class="meta">
      <strong>{{ item.source || 'Unknown' }}</strong>
      <span v-if="displayDate"> • {{ displayDate }}</span>
      <span v-if="hostname"> • {{ hostname }}</span>
    </div>

    <p v-if="item.summary">{{ clean(item.summary) }}</p>

    <ul v-if="item.bullets?.length" style="margin:8px 0 0 18px">
      <li v-for="b in item.bullets" :key="b">{{ b }}</li>
    </ul>

    <div class="tags" v-if="item.tags?.length">
      <span class="tag" v-for="t in item.tags" :key="t">#{{ t }}</span>
    </div>
  </article>
</template>
