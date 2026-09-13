<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, LayoutGrid, Mail, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next';
import { LOGIN_BASE_URL, flattenApplicationPages, getApplicationMenuTree, logout, navigateTo, redirectToChangePassword, resolvePortalPresentationMode, type PortalAccessibleApplication, type PortalAccessibleMenuTreeNode } from './api/portalAuth';
import PortalMenuTree from './components/PortalMenuTree.vue';
import { setupMicroApps } from './microApps';
import { PORTAL_APP_NAME, PORTAL_LOGO_TEXT } from './portalConfig';
import { trustedApplicationIcon } from './trustedApplicationIcons';
import CustomThemeEditor from './view/CustomThemeEditor.vue';
import { clearAuthenticatedState, initTheme, loadAccessibleApplications, loadCurrentUser, portalState, reconnectMessageEvents, refreshUnreadCount, setTheme, startMessageEvents, stopMessageEvents, syncActiveApp, type ThemeName } from './portalState';

const router = useRouter();
const route = useRoute();
const NAVIGATION_COLLAPSED_STORAGE_KEY = 'simple-iam-portal-navigation-collapsed';
const EXPANDED_APPLICATION_MENUS_STORAGE_KEY = 'simple-iam-portal-expanded-application-menus';
const EXPANDED_MENU_NODES_STORAGE_KEY = 'simple-iam-portal-expanded-menu-nodes';
const userMenuOpen = ref(false);
const navigationOpen = ref(false);
const navigationCollapsed = ref(readNavigationCollapsedPreference());
const savedExpandedApplicationMenus = readExpandedApplicationMenusPreference();
const expandedApplicationCodes = ref(savedExpandedApplicationMenus ?? []);
const applicationMenusInitialized = ref(savedExpandedApplicationMenus !== null);
const expandedMenuNodeKeys = ref(readExpandedMenuNodesPreference());
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
const immersivePresentation = computed(() => resolvePortalPresentationMode(
  portalState.applications.find((application) => application.applicationCode === portalState.activeAppCode),
  `/app${route.fullPath}`
) === 'IMMERSIVE');

watch(
  () => router.currentRoute.value.fullPath,
  (path) => {
    syncActiveApp(`/app${path}`);
    const application = portalState.applications.find((item) => item.applicationCode === portalState.activeAppCode);
    if (application) {
      expandActiveMenuAncestors(application);
    }
  },
  { immediate: true }
);

watch(navigationCollapsed, (collapsed) => {
  localStorage.setItem(NAVIGATION_COLLAPSED_STORAGE_KEY, String(collapsed));
});

watch(expandedApplicationCodes, (applicationCodes) => {
  localStorage.setItem(EXPANDED_APPLICATION_MENUS_STORAGE_KEY, JSON.stringify(applicationCodes));
});

watch(expandedMenuNodeKeys, (nodeKeys) => {
  localStorage.setItem(EXPANDED_MENU_NODES_STORAGE_KEY, JSON.stringify(nodeKeys));
});

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
    initializeApplicationMenus();
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
  const currentRoute = router.currentRoute.value;
  const currentPath = `/app${currentRoute.path}`;
  const application = resolveDefaultEntryApplication(currentPath);
  if (!application) {
    return;
  }
  const targetRoute = resolveDefaultEntryRoute(application, currentPath);
  if (!targetRoute || targetRoute === currentPath) {
    return;
  }
  // 子应用路径挂在门户 /app/ base 下（routePrefix 形如 /app/iam），去掉首个
  // /app 再交回 vue-router（base 会拼回），URL 落在 /app/iam/... 让 qiankun 匹配
  await router.replace({
    path: targetRoute.replace('/app', '') || '/',
    query: currentRoute.query,
    hash: currentRoute.hash
  });
  syncActiveApp(targetRoute);
}

function resolveDefaultEntryApplication(currentPath: string) {
  if (currentPath === '/app/' || currentPath === '/app') {
    const landingApplication = portalState.loginLandingApplicationCode
      ? portalState.applications.find((application) => application.applicationCode === portalState.loginLandingApplicationCode)
      : undefined;
    return landingApplication || firstApplicationWithAccessiblePage() || portalState.applications[0];
  }
  return portalState.applications.find((application) => currentPath === application.routePrefix
    || currentPath === `${application.routePrefix}/`);
}

function resolveDefaultEntryRoute(application: PortalAccessibleApplication, currentPath: string) {
  if (application.defaultEntry?.path) {
    return `${application.routePrefix}${application.defaultEntry.path}`.replace(/\/{2,}/g, '/');
  }
  const firstAccessiblePage = currentPath === '/app/' || currentPath === '/app'
    ? firstApplicationWithAccessiblePage()
    : undefined;
  return flattenApplicationPages(firstAccessiblePage || application)[0]?.route || application.routePrefix;
}

function firstApplicationWithAccessiblePage() {
  return portalState.applications.find((application) => flattenApplicationPages(application).length > 0);
}

function openRoute(route: string) {
  navigationOpen.value = false;
  userMenuOpen.value = false;
  syncActiveApp(route);
  router.push(route.replace('/app', '') || '/iam');
}

function readNavigationCollapsedPreference() {
  return localStorage.getItem(NAVIGATION_COLLAPSED_STORAGE_KEY) === 'true';
}

function readExpandedApplicationMenusPreference() {
  const storedValue = localStorage.getItem(EXPANDED_APPLICATION_MENUS_STORAGE_KEY);
  if (storedValue === null) {
    return null;
  }
  try {
    const applicationCodes = JSON.parse(storedValue);
    return Array.isArray(applicationCodes) && applicationCodes.every((code) => typeof code === 'string')
      ? applicationCodes
      : null;
  } catch {
    return null;
  }
}

function readExpandedMenuNodesPreference() {
  const storedValue = localStorage.getItem(EXPANDED_MENU_NODES_STORAGE_KEY);
  if (storedValue === null) {
    return [];
  }
  try {
    const nodeKeys = JSON.parse(storedValue);
    return Array.isArray(nodeKeys) && nodeKeys.every((nodeKey) => typeof nodeKey === 'string') ? nodeKeys : [];
  } catch {
    return [];
  }
}

function applicationMenuTree(application: PortalAccessibleApplication) {
  return getApplicationMenuTree(application);
}

function hasApplicationMenu(application: PortalAccessibleApplication) {
  return applicationMenuTree(application).length > 0;
}

function toggleNavigationCollapsed() {
  navigationCollapsed.value = !navigationCollapsed.value;
}

function initializeApplicationMenus() {
  if (applicationMenusInitialized.value) {
    return;
  }
  const activeApplication = portalState.applications.find((application) => application.applicationCode === portalState.activeAppCode)
    || portalState.applications[0];
  if (!activeApplication || !hasApplicationMenu(activeApplication)) {
    return;
  }
  expandedApplicationCodes.value = [activeApplication.applicationCode];
  expandActiveMenuAncestors(activeApplication);
  applicationMenusInitialized.value = true;
}

function isApplicationMenuExpanded(applicationCode: string) {
  return expandedApplicationCodes.value.includes(applicationCode);
}

function handleApplicationRootClick(application: PortalAccessibleApplication) {
  if (!hasApplicationMenu(application)) {
    openRoute(application.routePrefix);
    return;
  }
  if (navigationCollapsed.value) {
    navigationCollapsed.value = false;
    if (!isApplicationMenuExpanded(application.applicationCode)) {
      expandedApplicationCodes.value = [...expandedApplicationCodes.value, application.applicationCode];
    }
    return;
  }
  expandedApplicationCodes.value = isApplicationMenuExpanded(application.applicationCode)
    ? expandedApplicationCodes.value.filter((applicationCode) => applicationCode !== application.applicationCode)
    : [...expandedApplicationCodes.value, application.applicationCode];
}

function toggleMenuGroup(nodeKey: string) {
  expandedMenuNodeKeys.value = expandedMenuNodeKeys.value.includes(nodeKey)
    ? expandedMenuNodeKeys.value.filter((key) => key !== nodeKey)
    : [...expandedMenuNodeKeys.value, nodeKey];
}

function expandActiveMenuAncestors(application: PortalAccessibleApplication) {
  const currentPath = `/app${router.currentRoute.value.fullPath}`;
  const ancestorKeys: string[] = [];
  const visit = (nodes: PortalAccessibleMenuTreeNode[], ancestors: string[]): boolean => nodes.some((node) => {
    const key = `${application.applicationCode}:${node.code}`;
    if (node.nodeType === 'PAGE' && node.route && (currentPath === node.route || currentPath.startsWith(`${node.route}/`))) {
      ancestorKeys.push(...ancestors);
      return true;
    }
    return visit(node.children || [], node.nodeType === 'GROUP' ? [...ancestors, key] : ancestors);
  });
  visit(applicationMenuTree(application), []);
  if (ancestorKeys.length > 0) {
    expandedMenuNodeKeys.value = [...new Set([...expandedMenuNodeKeys.value, ...ancestorKeys])];
  }
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
    initializeApplicationMenus();
    await nextTick();
    setupMicroApps();
  }
}

async function retryApplications() {
  const loaded = await loadAccessibleApplications();
  if (loaded && portalState.applications.length > 0) {
    await openDefaultRoute();
    initializeApplicationMenus();
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
  <div class="portal-shell" :class="{ 'portal-shell--immersive': immersivePresentation }">
    <header v-if="!immersivePresentation" class="portal-topbar">
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

    <div class="portal-body" :class="{ 'sidebar-collapsed': navigationCollapsed, 'portal-body--immersive': immersivePresentation }">
      <button v-if="!immersivePresentation && navigationOpen" class="navigation-backdrop" type="button" aria-label="关闭应用导航" @click="navigationOpen = false" />
      <nav v-if="!immersivePresentation" id="portal-navigation" class="app-sidebar" :class="{ open: navigationOpen }" aria-label="应用导航">
        <button
          class="navigation-rail-toggle"
          type="button"
          :aria-label="navigationCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-pressed="navigationCollapsed"
          aria-controls="portal-navigation"
          :title="navigationCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="toggleNavigationCollapsed"
        >
          <PanelLeftOpen v-if="navigationCollapsed" :size="18" :stroke-width="2" aria-hidden="true" />
          <PanelLeftClose v-else :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <section v-for="application in portalState.applications" :key="application.applicationCode" class="app-nav-group">
          <button
            class="app-nav-item"
            :class="{ active: portalState.activeAppCode === application.applicationCode }"
            type="button"
            :aria-label="hasApplicationMenu(application) ? `${application.applicationName}，${isApplicationMenuExpanded(application.applicationCode) ? '收起模块菜单' : '展开模块菜单'}` : application.applicationName"
            :aria-controls="hasApplicationMenu(application) ? `application-menu-${application.applicationCode}` : undefined"
            :aria-expanded="hasApplicationMenu(application) ? isApplicationMenuExpanded(application.applicationCode) : undefined"
            :title="application.applicationName"
            @click="handleApplicationRootClick(application)"
          >
            <span class="app-nav-icon" :aria-label="trustedApplicationIcon(application.icon).label" role="img">
              <component :is="trustedApplicationIcon(application.icon).component" :size="18" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="app-nav-copy">
              <strong>{{ application.applicationName }}</strong>
              <small>{{ application.description || '微前端应用' }}</small>
            </span>
            <ChevronDown
              v-if="hasApplicationMenu(application)"
              class="app-nav-chevron"
              :class="{ collapsed: !isApplicationMenuExpanded(application.applicationCode) }"
              :size="16"
              :stroke-width="2"
              aria-hidden="true"
            />
          </button>
          <div
            v-if="isApplicationMenuExpanded(application.applicationCode)"
            :id="`application-menu-${application.applicationCode}`"
            class="app-subnav"
            :aria-label="`${application.applicationName}模块导航`"
          >
            <PortalMenuTree
              :application-code="application.applicationCode"
              :nodes="applicationMenuTree(application)"
              :active-menu-code="portalState.activeMenuCode"
              :expanded-node-keys="expandedMenuNodeKeys"
              @navigate="openRoute"
              @toggle-group="toggleMenuGroup"
            />
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
