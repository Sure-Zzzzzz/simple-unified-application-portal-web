<script setup lang="ts">
import { reactive, ref } from 'vue';
import { X } from 'lucide-vue-next';
import { getCustomThemeDraft, saveCustomThemeDraft, validateCustomThemeDraft, type CustomThemeDraft } from '../portalState';

type EditorState = 'editing' | 'validation' | 'discard' | 'failure' | 'applied';

const emit = defineEmits<{ close: [] }>();
const draft = reactive<CustomThemeDraft>(getCustomThemeDraft());
const state = ref<EditorState>('editing');
const invalidFields = ref<string[]>([]);

const tokenGroups: Array<{ title: string; hint: string; items: Array<{ key: keyof CustomThemeDraft; label: string; description: string }> }> = [
  {
    title: '主色',
    hint: '按钮、链接等主要操作',
    items: [
      { key: 'primary', label: '主操作', description: '主要按钮与链接' },
      { key: 'primaryHover', label: '悬停', description: '主操作悬停反馈' },
      { key: 'primaryActive', label: '按下', description: '主操作按下反馈' },
      { key: 'primaryWeak', label: '浅色强调', description: '选中底与浅色强调' },
      { key: 'primaryText', label: '主按钮文字', description: '主按钮上的文字色' }
    ]
  },
  {
    title: '页面与容器',
    hint: '底色分层',
    items: [
      { key: 'canvas', label: '页面背景', description: '整体画布底色' },
      { key: 'surface', label: '卡片背景', description: '卡片与面板底色' },
      { key: 'surfaceRaised', label: '浮层背景', description: '下拉、抽屉等浮层' },
      { key: 'surfaceSoft', label: '柔和底色', description: '表头与次级分区' }
    ]
  },
  {
    title: '文字',
    hint: '文字层级',
    items: [
      { key: 'textPrimary', label: '主要文字', description: '标题与正文' },
      { key: 'textSecondary', label: '辅助文字', description: '说明与次要信息' },
      { key: 'textDisabled', label: '禁用文字', description: '不可用状态文字' }
    ]
  },
  {
    title: '边框与焦点',
    hint: '描边与聚焦',
    items: [
      { key: 'border', label: '常规边框', description: '分割线与描边' },
      { key: 'borderStrong', label: '强调边框', description: '强调描边与表头线' },
      { key: 'focusRing', label: '焦点环', description: '键盘聚焦高亮' }
    ]
  },
  {
    title: '状态色',
    hint: '提示与反馈',
    items: [
      { key: 'success', label: '成功', description: '成功文字与图标' },
      { key: 'successBg', label: '成功底色', description: '成功提示背景' },
      { key: 'warning', label: '提醒', description: '提醒文字与图标' },
      { key: 'warningBg', label: '提醒底色', description: '提醒提示背景' },
      { key: 'danger', label: '危险', description: '错误文字与图标' },
      { key: 'dangerBg', label: '危险底色', description: '错误提示背景' },
      { key: 'info', label: '信息', description: '辅助提示文字' },
      { key: 'infoBg', label: '信息底色', description: '辅助提示背景' }
    ]
  },
  {
    title: '遮罩',
    hint: '浮层遮挡',
    items: [
      { key: 'overlayScrim', label: '弹窗遮罩', description: '弹窗与抽屉后的暗色层' }
    ]
  }
];
const allTokenItems = tokenGroups.flatMap(group => group.items);

function isColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function validate() {
  invalidFields.value = allTokenItems.filter(item => !isColor(draft[item.key])).map(item => item.key);
  if (invalidFields.value.length > 0 || !validateCustomThemeDraft({ ...draft }).valid) {
    state.value = 'validation';
    return false;
  }
  invalidFields.value = [];
  return true;
}

async function apply() {
  if (!validate()) {
    return;
  }
  try {
    await saveCustomThemeDraft({ ...draft });
    state.value = 'applied';
  } catch {
    state.value = 'failure';
  }
}

function close() {
  if (state.value === 'editing' || state.value === 'validation') {
    state.value = 'discard';
    return;
  }
  emit('close');
}

function continueEditing() {
  state.value = 'editing';
}

function resetToDefault() {
  Object.assign(draft, getCustomThemeDraft(true));
  invalidFields.value = [];
  state.value = 'editing';
}

function discard() {
  emit('close');
}
</script>

<template>
  <div class="custom-theme-backdrop" role="presentation" @click.self="close">
    <section class="custom-theme-editor" role="dialog" aria-modal="true" aria-labelledby="custom-theme-title">
      <header class="custom-theme-header">
        <div>
          <p class="custom-theme-eyebrow">外观设置</p>
          <h1 id="custom-theme-title">自定义主题</h1>
          <p>调整主题颜色令牌，让门户与所有子应用保持一致的观感。</p>
        </div>
        <button type="button" class="custom-theme-close" aria-label="关闭自定义主题" @click="close"><X :size="20" :stroke-width="2" aria-hidden="true" /></button>
      </header>

      <div class="custom-theme-body">
        <section class="custom-theme-controls" aria-label="颜色设置">
          <h2>主题颜色</h2>
          <p class="custom-theme-hint">仅调整颜色，不会改变页面布局和文字内容。</p>
          <section v-for="group in tokenGroups" :key="group.title" class="custom-theme-group">
            <h3>{{ group.title }}<small>{{ group.hint }}</small></h3>
            <label v-for="item in group.items" :key="item.key" class="custom-color-row" :class="{ invalid: invalidFields.includes(item.key) }">
              <input v-model="draft[item.key]" type="color" :aria-label="`${item.label}颜色`">
              <span>
                <strong>{{ item.label }}</strong>
                <small>{{ item.description }}</small>
              </span>
              <input v-model="draft[item.key]" class="custom-color-value" :aria-label="`${item.label}颜色值`" maxlength="7">
            </label>
          </section>
          <p v-if="state === 'validation'" class="custom-theme-error" role="alert">请检查颜色值，填写 6 位十六进制颜色。</p>
        </section>

        <section class="custom-theme-preview" aria-label="主题预览">
          <h2>颜色效果预览</h2>
          <div class="custom-preview-scene" :style="{ backgroundColor: draft.canvas }">
            <div class="custom-preview-panel" :style="{ backgroundColor: draft.surface, borderColor: draft.border }">
              <p class="custom-preview-title" :style="{ color: draft.textPrimary }">卡片标题</p>
              <p class="custom-preview-desc" :style="{ color: draft.textSecondary }">辅助说明文字展示层级关系</p>
              <div class="custom-preview-actions">
                <span class="custom-preview-button" :style="{ backgroundColor: draft.primary, color: draft.primaryText }">主要按钮</span>
                <span class="custom-preview-soft" :style="{ backgroundColor: draft.primaryWeak, color: draft.primary }">浅色强调</span>
              </div>
            </div>
            <div class="custom-preview-statuses">
              <span :style="{ color: draft.success, backgroundColor: draft.successBg }">成功</span>
              <span :style="{ color: draft.warning, backgroundColor: draft.warningBg }">提醒</span>
              <span :style="{ color: draft.danger, backgroundColor: draft.dangerBg }">危险</span>
              <span :style="{ color: draft.info, backgroundColor: draft.infoBg }">信息</span>
            </div>
          </div>
        </section>
      </div>

      <p v-if="state === 'failure'" class="custom-theme-error custom-theme-error--footer" role="alert">主题应用失败，请稍后重试。</p>
      <p v-if="state === 'applied'" class="custom-theme-success" role="status">自定义主题已应用。</p>
      <footer class="custom-theme-footer">
        <button type="button" class="custom-theme-secondary" @click="close">取消</button>
        <button type="button" class="custom-theme-secondary" @click="resetToDefault">恢复默认</button>
        <button type="button" class="custom-theme-primary" @click="apply">应用主题</button>
      </footer>

      <div v-if="state === 'discard'" class="custom-theme-confirm-backdrop" role="presentation">
        <section class="custom-theme-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-theme-title">
          <h2 id="discard-theme-title">放弃本次颜色调整？</h2>
          <p>当前修改尚未应用，放弃后将不会保存。</p>
          <div class="custom-theme-confirm-actions">
            <button type="button" class="custom-theme-secondary" @click="continueEditing">继续编辑</button>
            <button type="button" class="custom-theme-primary" @click="discard">放弃更改</button>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
