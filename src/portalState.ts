import { reactive } from 'vue';
import type { Subscription } from '@sure-zzzzzz/simple-frontend-contract';
import {
  applyTheme as applyThemeContract,
  createDefaultCustomThemeTokens,
  createLightThemePreference,
  normalizeThemePreference,
  validateCustomThemeTokens,
  type CompleteCustomThemeTokens,
  type ThemeMode,
  type ThemePreference,
  type ThemeSnapshot
} from '@sure-zzzzzz/simple-iam-theme-contract';
import {
  fetchAccessibleApplications,
  fetchCurrentUser,
  fetchMessages as fetchMessagesApi,
  fetchPortalNavigationContext,
  fetchThemePreference,
  fetchUnreadMessageCount,
  isPortalHttpNotFound,
  markAllMessagesRead as markAllMessagesReadApi,
  markMessageRead as markMessageReadApi,
  redirectToLogin,
  saveThemePreference,
  UnauthorizedError,
  type AuthUser,
  type IamMessage,
  type IamMessagePage,
  flattenApplicationPages,
  type PortalAccessibleApplication,
  type PortalThemePreference
} from './api/portalAuth';

export type ThemeName = ThemeMode;
export type MessageEventStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type PortalThemeSnapshot = ThemeSnapshot & { readonly revision: number };

export type CustomThemeDraft = CompleteCustomThemeTokens;

export type PortalThemeListener = (snapshot: PortalThemeSnapshot) => void;

const themeListeners = new Set<PortalThemeListener>();
let themeRevision = 0;
let themeSnapshot = createThemeSnapshot(createLightThemePreference());
let confirmedThemeSnapshot = themeSnapshot;
// 服务端返回的色板是用户资产，不随模式切换销毁；编辑器草稿优先取它（后端任何模式都回传）
let savedCustomTokens: CompleteCustomThemeTokens | null = null;

export const portalState = reactive({
  currentUser: null as AuthUser | null,
  messages: [] as IamMessage[],
  messagesPage: 1,
  messagesTotalPages: 0,
  messagesTotal: 0,
  messagesPageSize: 10,
  messagesLoading: false,
  messagesError: '',
  messageActionLoading: false,
  authLoading: true,
  authError: '',
  applicationsLoading: false,
  applicationsError: '',
  applications: [] as PortalAccessibleApplication[],
  loginLandingApplicationCode: null as string | null,
  unreadCount: 0,
  messageVersion: 0,
  messageEventStatus: 'idle' as MessageEventStatus,
  theme: 'light' as ThemeName,
  themeError: '',
  activeAppCode: '',
  activeMenuCode: ''
});

export function getCustomThemeDraft(defaults = false): CustomThemeDraft {
  const tokens = defaults
    ? createDefaultCustomThemeTokens()
    : savedCustomTokens
      ?? (themeSnapshot.mode === 'custom' ? themeSnapshot.customTokens : createDefaultCustomThemeTokens());
  return { ...tokens };
}

export function validateCustomThemeDraft(draft: CustomThemeDraft) {
  return validateCustomThemeTokens(draft);
}

export async function saveCustomThemeDraft(draft: CustomThemeDraft) {
  const validation = validateCustomThemeDraft(draft);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }
  await saveThemePreferenceSnapshot({
    contractVersion: 1,
    mode: 'custom',
    customTokens: validation.tokens
  });
}

export function getThemeSnapshot(): PortalThemeSnapshot {
  return themeSnapshot;
}

export function subscribeTheme(listener: PortalThemeListener): () => void {
  themeListeners.add(listener);
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    themeListeners.delete(listener);
  };
}

export const themeSubscription: Subscription<PortalThemeSnapshot> = {
  current: getThemeSnapshot,
  subscribe: subscribeTheme
};

export async function loadCurrentUser() {
  portalState.authLoading = true;
  portalState.authError = '';
  try {
    portalState.currentUser = await fetchCurrentUser();
    await loadThemePreference();
  } catch (error) {
    if (isUnauthorized(error)) {
      clearAuthenticatedState();
      redirectToLogin();
      return null;
    }
    portalState.authError = error instanceof Error ? error.message : '读取当前用户失败';
    return null;
  } finally {
    portalState.authLoading = false;
  }

  await loadAccessibleApplications();
  return portalState.currentUser;
}

export async function loadAccessibleApplications() {
  portalState.applicationsLoading = true;
  portalState.applicationsError = '';
  try {
    const context = await loadPortalNavigationContext();
    portalState.applications = context.applications;
    portalState.loginLandingApplicationCode = context.loginLandingApplicationCode;
    syncActiveApp();
    return true;
  } catch (error) {
    portalState.applications = [];
    portalState.loginLandingApplicationCode = null;
    if (isUnauthorized(error)) {
      clearAuthenticatedState();
      redirectToLogin();
      return false;
    }
    portalState.applicationsError = error instanceof Error ? error.message : '读取可访问应用失败';
    return false;
  } finally {
    portalState.applicationsLoading = false;
  }
}

async function loadPortalNavigationContext() {
  try {
    return await fetchPortalNavigationContext();
  } catch (error) {
    // 先发布 Portal 再升级服务端时，旧服务的新增端点返回 404，保持 1.0 侧边栏可用。
    if (!isPortalHttpNotFound(error)) {
      throw error;
    }
    return {
      applications: await fetchAccessibleApplications(),
      loginLandingApplicationCode: null
    };
  }
}

export async function loadMessages(page = 1) {
  portalState.messagesLoading = true;
  portalState.messagesError = '';
  try {
    const response: IamMessagePage = await fetchMessagesApi(page, portalState.messagesPageSize);
    portalState.messages = response.content;
    portalState.messagesPage = response.page;
    portalState.messagesTotalPages = response.totalPages;
    portalState.messagesTotal = response.totalElements;
    return response;
  } catch (error) {
    portalState.messagesError = error instanceof Error ? error.message : '读取站内信失败';
    return null;
  } finally {
    portalState.messagesLoading = false;
  }
}

export async function markMessageRead(message: IamMessage) {
  if (message.read || portalState.messageActionLoading) {
    return message;
  }
  portalState.messageActionLoading = true;
  try {
    const updated = await markMessageReadApi(message.id);
    const index = portalState.messages.findIndex(item => item.id === updated.id);
    if (index >= 0) {
      portalState.messages[index] = updated;
    }
    await refreshUnreadCount();
    return updated;
  } finally {
    portalState.messageActionLoading = false;
  }
}

export async function markAllMessagesRead() {
  if (portalState.messageActionLoading) {
    return;
  }
  portalState.messageActionLoading = true;
  try {
    await markAllMessagesReadApi();
    await loadMessages(portalState.messagesPage);
    await refreshUnreadCount();
  } catch (error) {
    portalState.messagesError = error instanceof Error ? error.message : '全部标记已读失败';
    throw error;
  } finally {
    portalState.messageActionLoading = false;
  }
}

export function clearAuthenticatedState() {
  stopMessageEvents();
  portalState.currentUser = null;
  portalState.messages = [];
  portalState.messagesPage = 1;
  portalState.messagesTotalPages = 0;
  portalState.messagesTotal = 0;
  portalState.messagesPageSize = 10;
  portalState.messagesLoading = false;
  portalState.messagesError = '';
  portalState.messageActionLoading = false;
  portalState.applications = [];
  portalState.applicationsError = '';
  portalState.loginLandingApplicationCode = null;
  portalState.unreadCount = 0;
  portalState.activeAppCode = '';
  portalState.activeMenuCode = '';
  portalState.themeError = '';
  savedCustomTokens = null;
  applyConfirmedTheme(createLightThemePreference());
}

export async function refreshUnreadCount() {
  try {
    portalState.unreadCount = await fetchUnreadMessageCount();
  } catch {
    portalState.unreadCount = 0;
  }
}

let messageEventSource: EventSource | null = null;
let messageReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let messageReconnectAttempt = 0;
const MESSAGE_RECONNECT_BASE_DELAY_MS = 1000;
const MESSAGE_RECONNECT_MAX_DELAY_MS = 30_000;

export function startMessageEvents() {
  closeMessageEvents();
  portalState.messageEventStatus = 'connecting';
  try {
    messageEventSource = new EventSource('/iam/web/messages/events');
    messageEventSource.onopen = () => {
      // 退避计数只在真正连上后重置，重试途中的 start 不得清零
      messageReconnectAttempt = 0;
      portalState.messageEventStatus = 'connected';
    };
    messageEventSource.addEventListener('unread-count', (event) => {
      const count = Number(event.data);
      if (!Number.isNaN(count)) {
        // 只有 SSE 推来的未读数增加才视为新消息到达（fetch 路径的已读/刷新不触发列表重载）
        if (count > portalState.unreadCount) {
          portalState.messageVersion += 1;
        }
        portalState.unreadCount = count;
        portalState.messageEventStatus = 'connected';
      }
    });
    messageEventSource.onerror = () => {
      scheduleMessageEventReconnect();
    };
  } catch {
    messageEventSource = null;
    portalState.messageEventStatus = 'error';
  }
}

/**
 * 断线自动重连：指数退避（1s 起逐次翻倍、30s 封顶，±20% 抖动防多端同步重连）。
 * 自管重连并主动关闭旧连接——浏览器 EventSource 内建重连在 401 下停在 CLOSED，
 * 语义不可控，统一收口到本处。
 */
function scheduleMessageEventReconnect() {
  closeMessageEvents();
  if (messageReconnectTimer !== null) {
    return;
  }
  const cappedDelay = Math.min(
    MESSAGE_RECONNECT_BASE_DELAY_MS * 2 ** messageReconnectAttempt,
    MESSAGE_RECONNECT_MAX_DELAY_MS
  );
  const delay = cappedDelay * (0.8 + Math.random() * 0.4);
  messageReconnectAttempt = Math.min(messageReconnectAttempt + 1, 5);
  portalState.messageEventStatus = 'reconnecting';
  messageReconnectTimer = setTimeout(() => {
    messageReconnectTimer = null;
    void reconnectMessageEvents();
  }, delay);
}

export async function reconnectMessageEvents() {
  // 重连前探测登录态：会话已死则停止退避、走既有登出跳转，防 401 重连死循环
  try {
    await fetchCurrentUser();
  } catch (error) {
    if (isUnauthorized(error)) {
      clearAuthenticatedState();
      redirectToLogin();
      return;
    }
    // 服务暂不可达：本次不建连，退避节奏交给下一轮 onerror 排程
  }
  startMessageEvents();
  await refreshUnreadCount();
}

export function stopMessageEvents() {
  closeMessageEvents();
  messageReconnectAttempt = 0;
  portalState.messageEventStatus = 'idle';
}

function closeMessageEvents() {
  if (messageReconnectTimer !== null) {
    clearTimeout(messageReconnectTimer);
    messageReconnectTimer = null;
  }
  if (messageEventSource) {
    messageEventSource.close();
    messageEventSource = null;
  }
}

export async function setTheme(theme: Exclude<ThemeName, 'custom'>) {
  if (theme === confirmedThemeSnapshot.mode) {
    return;
  }
  await saveThemePreferenceSnapshot({ contractVersion: 1, mode: theme, customTokens: {} });
}

export function initTheme() {
  applyConfirmedTheme(createLightThemePreference());
}

export function syncActiveApp(pathname = window.location.pathname) {
  const matchedApp = portalState.applications
    .filter(application => pathname === application.routePrefix || pathname.startsWith(`${application.routePrefix}/`))
    .sort((left, right) => right.routePrefix.length - left.routePrefix.length)[0];
  portalState.activeAppCode = matchedApp?.applicationCode || '';
  const matchedMenu = matchedApp ? flattenApplicationPages(matchedApp)
    .filter(item => pathname === item.route || pathname.startsWith(`${item.route}/`))
    .sort((left, right) => right.route.length - left.route.length)[0] : undefined;
  portalState.activeMenuCode = matchedMenu?.code || (matchedApp ? flattenApplicationPages(matchedApp)[0]?.code : '') || '';
}

async function loadThemePreference() {
  portalState.themeError = '';
  try {
    const raw = await fetchThemePreference();
    captureSavedTokens(raw);
    applyConfirmedTheme(toThemePreference(raw));
  } catch (error) {
    if (isUnauthorized(error)) {
      throw error;
    }
    applyConfirmedTheme(createLightThemePreference());
    portalState.themeError = error instanceof Error ? error.message : '读取主题偏好失败';
  }
}

async function saveThemePreferenceSnapshot(preference: ThemePreference) {
  portalState.themeError = '';
  try {
    const saved = await saveThemePreference({
      contractVersion: preference.contractVersion,
      mode: preference.mode,
      customTokens: preference.customTokens
    });
    captureSavedTokens(saved);
    applyConfirmedTheme(toThemePreference(saved));
  } catch (error) {
    applyTheme(confirmedThemeSnapshot);
    notifyThemeListeners();
    portalState.themeError = error instanceof Error ? error.message : '保存主题偏好失败';
    throw error;
  }
}

// 在 normalize 丢弃非 custom 模式的 tokens 之前，先把服务端色板留作资产
function captureSavedTokens(preference: PortalThemePreference) {
  const tokens = preference.customTokens;
  if (!tokens || Object.keys(tokens).length === 0) {
    savedCustomTokens = null;
    return;
  }
  const validation = validateCustomThemeTokens(tokens);
  savedCustomTokens = validation.valid ? validation.tokens : null;
}

function toThemePreference(preference: PortalThemePreference): ThemePreference {
  return normalizeThemePreference(preference);
}

function createThemeSnapshot(preference: ThemePreference): PortalThemeSnapshot {
  return Object.freeze({ ...preference, revision: themeRevision });
}

function applyConfirmedTheme(preference: ThemePreference) {
  themeRevision += 1;
  themeSnapshot = createThemeSnapshot(preference);
  confirmedThemeSnapshot = themeSnapshot;
  portalState.theme = themeSnapshot.mode;
  applyTheme(themeSnapshot);
  notifyThemeListeners();
}

function applyTheme(snapshot: PortalThemeSnapshot) {
  applyThemeContract(document.documentElement, snapshot);
}

function notifyThemeListeners() {
  themeListeners.forEach(listener => {
    try {
      listener(themeSnapshot);
    } catch {
      // 单个子应用的主题处理异常不能影响其他已挂载应用。
    }
  });
}

function isUnauthorized(error: unknown) {
  return error instanceof UnauthorizedError || (error instanceof Error && error.message === '未登录');
}
