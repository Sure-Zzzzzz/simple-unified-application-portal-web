<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { ChevronRight, X } from 'lucide-vue-next';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';
import { loadMessages, markAllMessagesRead, markMessageRead, portalState } from '../portalState';
import type { IamMessage } from '../api/portalAuth';

const selectedMessage = ref<IamMessage | null>(null);
const actionError = ref('');

onMounted(() => loadMessages());

function changeMessagePage(page: number) {
  if (page < 1 || page > portalState.messagesTotalPages || page === portalState.messagesPage || portalState.messagesLoading) {
    return;
  }
  void loadMessages(page);
}

function changeMessagePageSize(size: number) {
  if (size < 1 || size === portalState.messagesPageSize || portalState.messagesLoading) {
    return;
  }
  portalState.messagesPageSize = size;
  void loadMessages(1);
}

// SSE 推来新消息（unread-count 增加）时保持当前页重载列表；加载中不重入
watch(() => portalState.messageVersion, () => {
  if (!portalState.messagesLoading) {
    void loadMessages(portalState.messagesPage);
  }
});

async function openMessage(message: IamMessage) {
  selectedMessage.value = message;
  actionError.value = '';
  if (message.read) {
    return;
  }
  try {
    selectedMessage.value = await markMessageRead(message);
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '标记已读失败';
  }
}

async function markAllRead() {
  actionError.value = '';
  try {
    await markAllMessagesRead();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '全部标记已读失败';
  }
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}
</script>

<template>
  <section class="message-center" aria-label="站内信收件箱">
    <header class="message-center-toolbar">
      <div>
        <h2>站内信</h2>
        <p>查看管理员和业务应用发送给你的通知。</p>
      </div>
      <button
        class="message-center-action"
        type="button"
        :disabled="portalState.messageActionLoading || portalState.unreadCount === 0"
        @click="markAllRead"
      >
        {{ portalState.messageActionLoading ? '处理中...' : '全部标记已读' }}
      </button>
    </header>

    <p v-if="actionError" class="message-center-error" role="alert">{{ actionError }}</p>
    <p v-if="portalState.messagesError" class="message-center-error" role="alert">
      {{ portalState.messagesError }}
      <button type="button" @click="loadMessages(portalState.messagesPage)">重试</button>
    </p>

    <section v-if="portalState.messagesLoading" class="message-center-state">正在加载站内信...</section>
    <section v-else-if="portalState.messages.length === 0" class="message-center-state">
      <strong>暂无站内信</strong>
      <span>新的通知会显示在这里。</span>
    </section>
    <div v-else class="message-center-list">
      <button
        v-for="message in portalState.messages"
        :key="message.id"
        type="button"
        class="message-card"
        :class="{ unread: !message.read }"
        @click="openMessage(message)"
      >
        <span class="message-card-status" aria-hidden="true"></span>
        <span class="message-card-main">
          <strong>{{ message.title }}</strong>
          <span class="message-card-excerpt">{{ message.senderUsername }}：{{ message.content }}</span>
        </span>
        <span class="message-card-side">
          <small>{{ formatTime(message.createdAt) }}</small>
          <span class="message-card-arrow" aria-hidden="true"><ChevronRight :size="16" :stroke-width="2" /></span>
        </span>
      </button>
    </div>

    <Pagination
      v-if="portalState.messagesTotal > 0"
      :current="portalState.messagesPage"
      :total="portalState.messagesTotal"
      :page-size="portalState.messagesPageSize"
      @update:current="changeMessagePage"
      @update:page-size="changeMessagePageSize"
    />

    <div v-if="selectedMessage" class="message-detail-backdrop" @click.self="selectedMessage = null">
      <article class="message-detail" aria-label="站内信详情">
        <header>
          <h3>{{ selectedMessage.title }}</h3>
          <button type="button" aria-label="关闭详情" @click="selectedMessage = null"><X :size="20" :stroke-width="2" aria-hidden="true" /></button>
        </header>
        <p class="message-detail-meta">{{ selectedMessage.senderUsername }} · {{ formatTime(selectedMessage.createdAt) }}</p>
        <p class="message-detail-content">{{ selectedMessage.content }}</p>
      </article>
    </div>
  </section>
</template>
