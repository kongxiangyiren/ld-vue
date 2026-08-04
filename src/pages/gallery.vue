<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { Delete, Picture, Search, View } from '@element-plus/icons-vue';

  import { useGalleryStore, type GenerationRecord } from '@/stores/gallery';

  const gallery = useGalleryStore();

  defineOptions({ name: 'GalleryPage' });

  const keyword = ref('');
  const previewId = ref('');
  const previewVisible = ref(false);
  const selectedIds = ref<string[]>([]);

  const filteredItems = computed(() => {
    const query = keyword.value.trim().toLowerCase();
    if (!query) {
      return gallery.items;
    }
    return gallery.items.filter(item => item.prompt.toLowerCase().includes(query));
  });

  const previewItem = computed(() => gallery.items.find(item => item.id === previewId.value));
  const allSelected = computed(
    () =>
      filteredItems.value.length > 0 &&
      filteredItems.value.every(item => selectedIds.value.includes(item.id))
  );

  function isSelected(id: string) {
    return selectedIds.value.includes(id);
  }

  function toggleSelect(item: GenerationRecord) {
    selectedIds.value = isSelected(item.id)
      ? selectedIds.value.filter(id => id !== item.id)
      : [...selectedIds.value, item.id];
  }

  function toggleSelectAll() {
    if (allSelected.value) {
      const visibleIds = new Set(filteredItems.value.map(item => item.id));
      selectedIds.value = selectedIds.value.filter(id => !visibleIds.has(id));
      return;
    }

    const next = new Set(selectedIds.value);
    for (const item of filteredItems.value) {
      next.add(item.id);
    }
    selectedIds.value = [...next];
  }

  function formatDate(timestamp: number) {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(timestamp);
  }

  function openPreview(item: GenerationRecord) {
    previewId.value = item.id;
    previewVisible.value = true;
  }

  async function removeItem(item: GenerationRecord) {
    try {
      await ElMessageBox.confirm('删除这条生成记录？', '删除记录', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      });
      await gallery.removeItem(item.id);
      selectedIds.value = selectedIds.value.filter(id => id !== item.id);
      if (previewId.value === item.id) {
        previewVisible.value = false;
      }
      ElMessage.success('已删除');
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(error instanceof Error ? error.message : '删除失败');
      }
    }
  }

  async function clearAll() {
    if (!gallery.items.length) {
      return;
    }

    try {
      await ElMessageBox.confirm('清空全部生成记录？', '清空画廊', {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'warning'
      });
      await gallery.clearItems();
      selectedIds.value = [];
      previewVisible.value = false;
      ElMessage.success('画廊已清空');
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(error instanceof Error ? error.message : '清空失败');
      }
    }
  }

  async function removeSelected() {
    const ids = [...selectedIds.value];
    if (!ids.length) {
      return;
    }

    try {
      await ElMessageBox.confirm(`删除选中的 ${ids.length} 条记录？`, '批量删除', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      });
      for (const id of ids) {
        await gallery.removeItem(id);
      }
      selectedIds.value = [];
      ElMessage.success(`已删除 ${ids.length} 条记录`);
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(error instanceof Error ? error.message : '批量删除失败');
      }
    }
  }

  onMounted(() => {
    void gallery
      .loadItems()
      .then(() => {
        selectedIds.value = [];
      })
      .catch(error => {
        ElMessage.error(error instanceof Error ? error.message : '画廊加载失败');
      });
  });
</script>

<template>
  <div class="mx-auto max-w-370 p-4 lg:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold lg:text-2xl">生成画廊</h1>
        <p class="mt-1 text-sm text-muted">{{ gallery.items.length }} 条本地记录</p>
      </div>
      <div class="flex gap-2">
        <el-input
          v-model="keyword"
          class="w-56"
          :prefix-icon="Search"
          placeholder="搜索提示词"
          clearable
        />
        <el-button
          :type="allSelected ? 'primary' : ''"
          :disabled="!filteredItems.length"
          @click="toggleSelectAll"
        >
          全选
        </el-button>
        <el-button
          type="danger"
          plain
          :icon="Delete"
          :disabled="!selectedIds.length"
          @click="removeSelected"
        >
          批量删除{{ selectedIds.length ? ` (${selectedIds.length})` : '' }}
        </el-button>
        <el-button :icon="Delete" plain @click="clearAll">清空</el-button>
      </div>
    </div>

    <div v-loading="gallery.loading" class="min-h-80">
      <div
        v-if="!gallery.loading && !filteredItems.length"
        class="flex min-h-80 flex-col items-center justify-center gap-3 text-muted"
      >
        <el-icon :size="42"><Picture /></el-icon>
        <span class="text-sm">还没有生成记录</span>
      </div>

      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        <article
          v-for="item in filteredItems"
          :key="item.id"
          class="group relative overflow-hidden rounded-lg border border-line bg-white"
          :class="isSelected(item.id) ? 'ring-2 ring-primary' : ''"
        >
          <div class="absolute top-3 left-3 z-10">
            <el-checkbox
              :model-value="isSelected(item.id)"
              size="large"
              @click.stop
              @change="toggleSelect(item)"
            />
          </div>
          <button
            type="button"
            class="block w-full overflow-hidden bg-surface"
            @click="openPreview(item)"
          >
            <img
              :src="item.imageDataUrl"
              :alt="item.prompt"
              class="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
          </button>
          <div class="p-3">
            <p class="line-clamp-2 min-h-10 text-sm font-medium">{{ item.prompt }}</p>
            <div class="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
              <span>{{ formatDate(item.createdAt) }}</span>
              <span>{{ item.width }}×{{ item.height }}</span>
            </div>
            <div class="mt-3 flex gap-2">
              <el-button class="flex-1" size="small" :icon="View" @click="openPreview(item)">
                查看
              </el-button>
              <el-button size="small" :icon="Delete" @click="removeItem(item)">删除</el-button>
            </div>
          </div>
        </article>
      </div>
    </div>

    <el-dialog v-model="previewVisible" width="min(920px, 94vw)" align-center :show-close="true">
      <template v-if="previewItem">
        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div class="flex items-center justify-center rounded-lg border border-line bg-surface">
            <img
              :src="previewItem.imageDataUrl"
              :alt="previewItem.prompt"
              class="max-h-[70vh] w-full object-contain"
            />
          </div>
          <div class="space-y-4">
            <div>
              <div class="text-xs text-muted">提示词</div>
              <p class="mt-1 text-sm leading-6 wrap-break-word whitespace-pre-wrap">
                {{ previewItem.prompt }}
              </p>
            </div>
            <div>
              <div class="text-xs text-muted">反向提示词</div>
              <p class="mt-1 text-xs leading-5 wrap-break-word whitespace-pre-wrap text-muted">
                {{ previewItem.negativePrompt || '未设置' }}
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="rounded-md bg-surface px-3 py-2">
                <div class="text-xs text-muted">模型</div>
                <div class="mt-1 truncate">{{ previewItem.modelName }}</div>
              </div>
              <div class="rounded-md bg-surface px-3 py-2">
                <div class="text-xs text-muted">采样器</div>
                <div class="mt-1 truncate">{{ previewItem.scheduler }}</div>
              </div>
              <div class="rounded-md bg-surface px-3 py-2">
                <div class="text-xs text-muted">种子</div>
                <div class="mt-1 font-mono">{{ previewItem.seed }}</div>
              </div>
              <div class="rounded-md bg-surface px-3 py-2">
                <div class="text-xs text-muted">生成时间</div>
                <div class="mt-1">{{ formatDate(previewItem.createdAt) }}</div>
              </div>
            </div>
            <el-button class="w-full" type="primary" @click="removeItem(previewItem)">
              删除记录
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
