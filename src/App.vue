<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, LayoutGrid, Mail, Menu } from 'lucide-vue-next';
import { LOGIN_BASE_URL, logout, navigateTo, redirectToChangePassword } from './api/portalAuth';
import { setupMicroApps } from './microApps';
import { PORTAL_APP_NAME, PORTAL_LOGO_TEXT } from './portalConfig';
import { trustedApplicationIcon } from './trustedApplicationIcons';
import CustomThemeEditor from './view/CustomThemeEditor.vue';
import { clearAuthenticatedState, initTheme, loadAccessibleApplications, loadCurrentUser, portalState, reconnectMessageEvents, refreshUnreadCount, setTheme, startMessageEvents, stopMessageEvents, syncActiveApp, type ThemeName } from './portalState';

const router = useRouter();
const route = useRoute();
const userMenuOpen = ref(false);
const navigationOpen = ref(false);
const logoutLoading = ref(false);
const messageReconnectLoading = ref(false);
const customThemeEditorOpen = ref(false);
const userDropdown = ref<HTMLElement | null>(null);

const themes: Array<{ code: ThemeName; name: string }> = [
  { code: 'light', name: '浅色' },
  { code: 'dark', name: '深色' },
  { code: 'custom', name: '自定义' }
];

const displayName = computed(() => portalState.currentUser?.displayName || portalState.currentUser?.username || '校验中');
const avatarText = computed(() => displayName.value.slice(0, 1).toUpperCase());

watch(
  () => router.currentRoute.value.fullPath,
  (path) => syncActiveApp(`/app${path}`),
  { immediate: true }
);

onMounted(async () => {
  initTheme();
  document.title = PORTAL_APP_NAME;
  await router.isReady();
  syncActiveApp();
  const user = await loadCurrentUser();
  if (user) {
    // 未读数与实时推送只依赖会话，无应用用户（纯收件箱用户）也要拉
    await refreshUnreadCount();
    startMessageEvents();
  }
  if (user && portalState.applications.length > 0) {
    await openDefaultRoute();
    await nextTick();
    setupMicroApps();
  }
});

onUnmounted(() => {
  stopMessageEvents();
  document.removeEventListener('keydown', closeOverlaysOnEscape);
  document.removeEventListener('pointerdown', closeUserMenuOnOutsideClick);
});

onMounted(() => {
  document.addEventListener('keydown', closeOverlaysOnEscape);
  document.addEventListener('pointerdown', closeUserMenuOnOutsideClick);
});

function closeOverlaysOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') {
    return;
  }
  userMenuOpen.value = false;
  navigationOpen.value = false;
  customThemeEditorOpen.value = false;
}

function closeUserMenuOnOutsideClick(event: PointerEvent) {
  if (userDropdown.value && !userDropdown.value.contains(event.target as Node)) {
    userMenuOpen.value = false;
  }
}

async function openDefaultRoute() {
  if (router.currentRoute.value.path !== '/') {
    return;
  }
  const application = portalState.applications[0];
  if (!application) {
    return;
  }
  const route = application.menus[0]?.route || application.routePrefix;
  // 子应用路径挂在门户 /app/ base 下（routePrefix 形如 /app/iam），去掉首个
  // /app 再交回 vue-router（base 会拼回），URL 落在 /app/iam/... 让 qiankun 匹配
  await router.replace(route.replace('/app', '') || '/');
  syncActiveApp(route);
}

function openRoute(route: string) {
  navigationOpen.value = false;
  userMenuOpen.value = false;
  syncActiveApp(route);
  router.push(route.replace('/app', '') || '/iam');
}

function openInbox() {
  navigationOpen.value = false;
  userMenuOpen.value = false;
  syncActiveApp('/app/inbox');
  router.push('/inbox');
}

async function retryAuthentication() {
  const user = await loadCurrentUser();
  if (user) {
    await refreshUnreadCount();
    startMessageEvents();
  }
  if (user && portalState.applications.length > 0) {
    await openDefaultRoute();
    await nextTick();
    setupMicroApps();
  }
}

async function retryApplications() {
  const loaded = await loadAccessibleApplications();
  if (loaded && portalState.applications.length > 0) {
    await openDefaultRoute();
    await nextTick();
    setupMicroApps();
    await refreshUnreadCount();
    startMessageEvents();
  }
}

async function reconnectMessages() {
  messageReconnectLoading.value = true;
  try {
    await reconnectMessageEvents();
  } finally {
    messageReconnectLoading.value = false;
  }
}

async function submitLogout() {
  logoutLoading.value = true;
  try {
    stopMessageEvents();
    await logout();
  } finally {
    clearAuthenticatedState();
    navigateTo(`${LOGIN_BASE_URL}/login`);
  }
}
</script>

<template>
  <div class="portal-shell">
    <header class="portal-topbar">
      <div class="portal-brand">
        <button
          class="navigation-toggle"
          type="button"
          :aria-expanded="navigationOpen"
          aria-controls="portal-navigation"
          aria-label="切换应用导航"
          @click="navigationOpen = !navigationOpen"
        >
          <Menu :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <button class="portal-logo" type="button" :aria-label="PORTAL_LOGO_TEXT" @click="openRoute('/app/')">
          <span class="portal-logo-mark" aria-hidden="true"></span>
          <span>{{ PORTAL_APP_NAME }}</span>
        </button>
      </div>
      <div class="portal-actions">
        <div class="message-entry">
          <button class="message-icon" type="button" aria-label="站内信" @click="openInbox">
            <Mail :size="18" :stroke-width="2" aria-hidden="true" />
            <em v-if="portalState.unreadCount > 0">{{ portalState.unreadCount }}</em>
          </button>
          <span v-if="portalState.messageEventStatus === 'reconnecting'" class="message-event-error" role="status">
            实时更新重连中...
          </span>
          <span v-else-if="portalState.messageEventStatus === 'error'" class="message-event-error" role="status">
            实时更新暂不可用
            <button type="button" :disabled="messageReconnectLoading" @click="reconnectMessages">
              {{ messageReconnectLoading ? '连接中...' : '重新连接' }}
            </button>
          </span>
        </div>
        <div ref="userDropdown" class="user-dropdown">
          <button class="user-trigger" type="button" :aria-expanded="userMenuOpen" aria-haspopup="menu" @click="userMenuOpen = !userMenuOpen">
            <span class="avatar">{{ avatarText }}</span>
            <span>{{ displayName }}</span>
            <ChevronDown :size="16" :stroke-width="2" aria-hidden="true" />
          </button>
          <div v-if="userMenuOpen" class="user-dropdown-menu" role="menu" aria-label="账户操作">
            <div class="theme-options">
              <span>主题</span>
              <p v-if="portalState.themeError" class="theme-error" role="alert">{{ portalState.themeError }}</p>
              <button
                v-for="theme in themes"
                :key="theme.code"
                type="button"
                :class="{ active: portalState.theme === theme.code }"
                @click="theme.code === 'custom' ? customThemeEditorOpen = true : setTheme(theme.code).catch(() => undefined)"
              >
                {{ theme.name }}
              </button>
              <button v-if="portalState.theme === 'custom'" type="button" class="custom-theme-entry" @click="customThemeEditorOpen = true">
                调整自定义主题
              </button>
            </div>
            <button type="button" @click="redirectToChangePassword">修改密码</button>
            <button class="logout-button" type="button" :disabled="logoutLoading" @click="submitLogout">
              {{ logoutLoading ? '退出中...' : '退出登录' }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="portal-body">
      <button v-if="navigationOpen" class="navigation-backdrop" type="button" aria-label="关闭应用导航" @click="navigationOpen = false" />
      <nav id="portal-navigation" class="app-sidebar" :class="{ open: navigationOpen }" aria-label="应用导航">
        <section v-for="application in portalState.applications" :key="application.applicationCode" class="app-nav-group">
          <button
            class="app-nav-item"
            :class="{ active: portalState.activeAppCode === application.applicationCode }"
            type="button"
            @click="openRoute(application.routePrefix)"
          >
            <span class="app-nav-icon" :aria-label="trustedApplicationIcon(application.icon).label" role="img">
              <component :is="trustedApplicationIcon(application.icon).component" :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span>
              <strong>{{ application.applicationName }}</strong>
              <small>{{ application.description || '微前端应用' }}</small>
            </span>
          </button>
          <div class="app-subnav" :aria-label="`${application.applicationName}模块导航`">
            <button
              v-for="item in application.menus"
              :key="item.code"
              class="app-subnav-item"
              :class="{ active: portalState.activeMenuCode === item.code }"
              type="button"
              @click="openRoute(item.route)"
            >
              {{ item.name }}
            </button>
          </div>
        </section>
      </nav>
      <main class="portal-content">
        <p v-if="portalState.authLoading" class="portal-message">正在验证当前会话...</p>
        <section v-else-if="portalState.authError" class="portal-message error" role="alert">
          <p>{{ portalState.authError }}</p>
          <button type="button" :disabled="portalState.authLoading" @click="retryAuthentication">重新验证会话</button>
        </section>
        <template v-else-if="portalState.currentUser">
          <p v-if="portalState.applicationsLoading" class="portal-message">正在加载应用导航...</p>
          <section v-else-if="portalState.applicationsError" class="portal-message error" role="alert">
            <p>{{ portalState.applicationsError }}</p>
            <button type="button" :disabled="portalState.applicationsLoading" @click="retryApplications">重试加载应用</button>
          </section>
          <section v-else-if="portalState.applications.length === 0 && route.path !== '/inbox'" class="portal-empty-state">
            <span class="portal-empty-icon" aria-hidden="true"><LayoutGrid :size="28" :stroke-width="2" /></span>
            <h1>暂未配置可访问应用</h1>
            <p>请联系管理员启用并发布可访问应用。</p>
          </section>
          <RouterView v-else />
        </template>
      </main>
    </div>
    <CustomThemeEditor
      v-if="customThemeEditorOpen"
      @close="customThemeEditorOpen = false"
    />
  </div>
</template>
