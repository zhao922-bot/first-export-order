<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import WorkbenchShell from '../components/layout/WorkbenchShell.vue';
import { useSliceGame } from '../app/useSliceGame';
import { exportJson } from '../app/exportJson';
import { maxSaveBytes, saveMessage, type SavedGame, type SaveSlot } from '../persistence/sliceSave';
const game = useSliceGame(),
  router = useRouter();
const notice = ref(''),
  selected = ref<SaveSlot>('manual1'),
  refresh = ref(0);
const slot = computed(() => {
  void refresh.value;
  return game.readSlot(selected.value);
});
const pending = ref<SavedGame | null>(null);
const busy = ref(false);
const exporting = ref(false);
async function exportCurrent() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    notice.value = await exportJson(game.exportCurrent(), '出海第一单-本地存档.json');
  } catch (cause) {
    notice.value = saveMessage(cause);
  } finally {
    exporting.value = false;
  }
}
async function exportRaw() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    notice.value = await exportJson(game.exportRaw(), '出海第一单-原始记录备份.json');
  } catch (cause) {
    notice.value = saveMessage(cause);
  } finally {
    exporting.value = false;
  }
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  pending.value = null;
  if (!file) return;
  if (file.size > maxSaveBytes) {
    notice.value = '文件超过 512 KiB，未读取或覆盖现有进度。';
    input.value = '';
    return;
  }
  busy.value = true;
  try {
    pending.value = game.readImport(await file.text());
    notice.value = '文件校验通过，请确认载入。';
  } catch (cause) {
    notice.value = saveMessage(cause);
  } finally {
    busy.value = false;
    input.value = '';
  }
}
function restore(value: SavedGame) {
  if (game.storageConflict) {
    notice.value = '请先导出本页进度并载入最新版本，再决定是否导入其他存档。';
    return;
  }
  if (game.session && !window.confirm('载入会替换当前进度。确定继续？')) return;
  try {
    game.restoreGame(value);
    pending.value = null;
    notice.value = '已载入；保存状态以顶部提示为准。';
    void router.push(game.resumeRoute);
  } catch (cause) {
    notice.value = saveMessage(cause);
  }
}
function saveManual() {
  if ((slot.value.game || slot.value.problem) && !window.confirm('此手动槽已有记录，确定覆盖？'))
    return;
  try {
    game.saveSlot(selected.value, slot.value.head);
    notice.value = '手动存档已保存。';
    refresh.value++;
  } catch (cause) {
    notice.value = saveMessage(cause);
    refresh.value++;
  }
}
function recoverManual() {
  if (!slot.value.backup) return;
  try {
    game.recoverSlot(selected.value, slot.value.head, slot.value.backup);
    refresh.value++;
    notice.value = '手动槽已恢复上一有效版本，可选择载入。';
  } catch (cause) {
    notice.value = saveMessage(cause);
  }
}
function reload() {
  if (
    game.session &&
    !window.confirm('载入浏览器最新存档会替换当前页面的进度。若有未保存修改，请先导出。确定继续？')
  )
    return;
  game.reloadSaved();
  refresh.value++;
  notice.value = game.session ? '已载入浏览器最新进度。' : game.storageNotice;
}
</script>
<template>
  <WorkbenchShell>
    <div class="work-area save-page">
      <h1>存档与恢复</h1>
      <p>自动存档保留当前与上一有效版本。另有三个手动槽；导出文件可在清理浏览器后导入。</p>
      <p v-if="notice" role="status" class="guidance-note">{{ notice }}</p>
      <section class="panel" aria-label="当前进度与恢复">
        <h2>当前进度</h2>
        <p v-if="game.session">
          第 {{ game.session.snapshot.story.stage }} 关 · 第 {{ game.session.snapshot.gameDay }} 天
        </p>
        <p v-else>尚无可继续的有效进度。</p>
        <p>{{ game.storageNotice || '还没有本地自动存档。' }}</p>
        <div class="actions">
          <button class="primary" :disabled="!game.session || exporting" @click="exportCurrent">
            导出当前进度
          </button>
          <button class="secondary" @click="reload">载入浏览器最新进度</button>
          <button v-if="game.hasBackup" class="primary" @click="game.recoverBackup">
            恢复上一有效存档
          </button>
          <button class="secondary" :disabled="exporting" @click="exportRaw">
            导出原始记录备份
          </button>
        </div>
        <RouterLink v-if="game.session" :to="game.resumeRoute" class="text-link"
          >返回本单进度</RouterLink
        >
      </section>
      <section class="panel" aria-label="导入本地存档">
        <h2>导入本地存档</h2>
        <label class="file-label"
          >选择 JSON 存档（最多 512 KiB）<input
            type="file"
            accept=".json,application/json"
            :disabled="busy"
            @change="importFile"
        /></label>
        <p class="muted">
          只接受匹配内容版本的存档；旧切片格式会保留业务事实并升级本地格式。原始记录备份供排查使用，不能直接当作单个存档导入。
        </p>
        <div v-if="pending" class="import-preview">
          <p>
            待载入：第 {{ pending.session.snapshot.story.stage }} 关 · 第
            {{ pending.session.snapshot.gameDay }} 天。
          </p>
          <button class="primary" :disabled="game.storageConflict" @click="restore(pending)">
            确认载入此存档
          </button>
          <button class="secondary" @click="pending = null">取消导入</button>
        </div>
      </section>
      <section class="panel" aria-label="手动存档">
        <h2>手动存档</h2>
        <label
          >手动存档槽<select v-model="selected" aria-label="手动存档槽">
            <option value="manual1">手动槽 1</option>
            <option value="manual2">手动槽 2</option>
            <option value="manual3">手动槽 3</option>
          </select></label
        >
        <p>
          {{
            slot.game
              ? `第 ${slot.game.session.snapshot.story.stage} 关 · 第 ${slot.game.session.snapshot.gameDay} 天`
              : slot.notice || '此槽为空。'
          }}
        </p>
        <div class="actions">
          <button
            class="secondary"
            :disabled="!game.session || game.storageConflict"
            @click="saveManual"
          >
            保存到此槽
          </button>
          <button
            class="secondary"
            :disabled="!slot.game || game.storageConflict"
            @click="slot.game && restore(slot.game)"
          >
            载入此槽
          </button>
          <button v-if="slot.backup" class="secondary" @click="recoverManual">
            恢复此槽上一有效版本
          </button>
        </div>
      </section>
      <RouterLink to="/" class="text-link">返回入口</RouterLink>
    </div>
  </WorkbenchShell>
</template>
