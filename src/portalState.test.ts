import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configurePortalNavigator } from './api/portalAuth';
import { clearAuthenticatedState, getCustomThemeDraft, getThemeSnapshot, initTheme, loadAccessibleApplications, loadCurrentUser, portalState, reconnectMessageEvents, saveCustomThemeDraft, setTheme, startMessageEvents, stopMessageEvents, subscribeTheme } from './portalState';

class FakeEventSource {
  url: string;
  listeners: Record<string, Array<(event: { data: string }) => void>> = {};
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static instances: FakeEventSource[] = [];
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, handler: (event: { data: string }) => void) {
    (this.listeners[name] ||= []).push(handler);
  }
  close() {
    this.closed = true;
  }
  emit(name: string, data: string) {
    this.listeners[name]?.forEach(handler => handler({ data }));
  }
  emitOpen() {
    this.onopen?.();
  }
  emitError() {
    this.onerror?.();
  }
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

describe('portal SSE 未读角标', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    portalState.currentUser = null;
    portalState.authLoading = false;
    portalState.authError = '';
    portalState.applicationsLoading = false;
    portalState.applicationsError = '';
    portalState.applications = [];
    portalState.unreadCount = 0;
    portalState.messageEventStatus = 'idle';
    configurePortalNavigator();
  });

  afterEach(() => {
    stopMessageEvents();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('startMessageEvents 应订阅 /iam/web/messages/events 并在收到 unread-count 事件时更新角标', () => {
    startMessageEvents();

    const source = FakeEventSource.instances[0];
    expect(source).toBeTruthy();
    expect(source.url).toBe('/iam/web/messages/events');

    expect(portalState.messageEventStatus).toBe('connecting');
    source.emit('unread-count', '5');
    expect(portalState.unreadCount).toBe(5);
    expect(portalState.messageEventStatus).toBe('connected');

    source.emit('unread-count', '2');
    expect(portalState.unreadCount).toBe(2);
  });

  it('unread-count 增加时才自增 messageVersion，持平与减少不触发', () => {
    portalState.unreadCount = 0;
    portalState.messageVersion = 0;
    startMessageEvents();

    const source = FakeEventSource.instances[0];
    source.emit('unread-count', '1');
    expect(portalState.messageVersion).toBe(1);

    source.emit('unread-count', '1');
    expect(portalState.messageVersion).toBe(1);

    source.emit('unread-count', '0');
    expect(portalState.messageVersion).toBe(1);

    source.emit('unread-count', '3');
    expect(portalState.messageVersion).toBe(2);
  });

  it('非数字的 unread-count 数据应被忽略', () => {
    startMessageEvents();
    portalState.unreadCount = 7;

    FakeEventSource.instances[0].emit('unread-count', 'not-a-number');

    expect(portalState.unreadCount).toBe(7);
  });

  it('stopMessageEvents 应关闭连接', () => {
    startMessageEvents();
    const source = FakeEventSource.instances[0];

    stopMessageEvents();

    expect(source.closed).toBe(true);
    expect(portalState.messageEventStatus).toBe('idle');
  });

  it('SSE 错误应关闭旧连接并转入自动重连排程，未立即新建连接', () => {
    startMessageEvents();
    const source = FakeEventSource.instances[0];

    source.emitError();

    expect(portalState.messageEventStatus).toBe('reconnecting');
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(source.closed).toBe(true);
  });

  it('手动重新连接应先探测登录态、关闭旧连接、建立替换连接并刷新未读数', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(
      url === '/iam/web/auth/me'
        ? jsonResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: [] })
        : jsonResponse(4)
    ));
    vi.stubGlobal('fetch', fetchMock);
    startMessageEvents();
    const first = FakeEventSource.instances[0];
    first.emitError();

    await reconnectMessageEvents();

    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(portalState.messageEventStatus).toBe('connecting');
    expect(portalState.unreadCount).toBe(4);
    expect(fetchMock).toHaveBeenCalledWith('/iam/web/auth/me', {
      credentials: 'include',
      headers: {}
    });
    expect(fetchMock).toHaveBeenCalledWith('/iam/web/messages/unread-count', {
      credentials: 'include',
      headers: {}
    });
  });

  it('断线后应按退避间隔自动重连，重连前探测登录态', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/iam/web/auth/me'
        ? jsonResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: [] })
        : jsonResponse(4)
    )));
    startMessageEvents();

    FakeEventSource.instances[0].emitError();
    expect(portalState.messageEventStatus).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(portalState.messageEventStatus).toBe('connecting');
    randomSpy.mockRestore();
  });

  it('重连探测 401 应停止自动重连、清理登录态并跳转登录', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('') })));
    const navigatorMock = vi.fn();
    configurePortalNavigator(navigatorMock);
    portalState.currentUser = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: [] };
    startMessageEvents();

    FakeEventSource.instances[0].emitError();
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(portalState.messageEventStatus).toBe('idle');
    expect(portalState.currentUser).toBeNull();
    expect(navigatorMock).toHaveBeenCalledWith(expect.stringContaining('/login'));
    randomSpy.mockRestore();
  });

  it('连续断线退避逐次翻倍，连接成功后归零重新起步', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/iam/web/auth/me'
        ? jsonResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: [] })
        : jsonResponse(4)
    )));
    startMessageEvents();

    FakeEventSource.instances[0].emitError();
    await vi.advanceTimersByTimeAsync(1000);
    FakeEventSource.instances[1].emitError();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeEventSource.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeEventSource.instances).toHaveLength(3);

    FakeEventSource.instances[2].emitOpen();
    FakeEventSource.instances[2].emitError();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeEventSource.instances).toHaveLength(4);
    randomSpy.mockRestore();
  });

  it('stopMessageEvents 应取消排程中的自动重连', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    startMessageEvents();

    FakeEventSource.instances[0].emitError();
    stopMessageEvents();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(portalState.messageEventStatus).toBe('idle');
    randomSpy.mockRestore();
  });

  it('重复 startMessageEvents 应先关闭旧连接再建立新连接', () => {
    startMessageEvents();
    const first = FakeEventSource.instances[0];

    startMessageEvents();

    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].url).toBe('/iam/web/messages/events');
  });

  it('应用导航加载失败不应覆盖已认证用户状态', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: [] }))
      .mockResolvedValueOnce(jsonResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce({ ok: false, status: 503, text: () => Promise.resolve('导航暂不可用') }));

    const user = await loadCurrentUser();

    expect(user?.username).toBe('admin');
    expect(portalState.currentUser?.username).toBe('admin');
    expect(portalState.authError).toBe('');
    expect(portalState.applicationsError).toBe('导航暂不可用');
  });

  it('导航接口返回未登录时应清理状态并跳转登录', async () => {
    const navigate = vi.fn();
    configurePortalNavigator(navigate);
    portalState.currentUser = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('') }));

    const loaded = await loadAccessibleApplications();

    expect(loaded).toBe(false);
    expect(portalState.currentUser).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2F');
  });

  it('退出会话时应清除站内信列表及操作状态', () => {
    portalState.messages = [{
      id: 1,
      recipientUserId: 1,
      senderUserId: 2,
      senderUsername: 'admin',
      title: '通知',
      content: '内容',
      sendBatchId: null,
      targetSummary: null,
      read: false,
      readAt: null,
      createdAt: '2026-08-10T08:00:00Z'
    }];
    portalState.messagesPage = 2;
    portalState.messagesTotalPages = 3;
    portalState.messagesLoading = true;
    portalState.messagesError = '读取失败';
    portalState.messageActionLoading = true;

    clearAuthenticatedState();

    expect(portalState.messages).toEqual([]);
    expect(portalState.messagesPage).toBe(1);
    expect(portalState.messagesTotalPages).toBe(0);
    expect(portalState.messagesLoading).toBe(false);
    expect(portalState.messagesError).toBe('');
    expect(portalState.messageActionLoading).toBe(false);
  });

  it('初始化和清理认证状态均应回到浅色，不复用任何全局主题缓存', () => {
    initTheme();
    expect(document.documentElement.dataset.iamTheme).toBe('light');

    portalState.theme = 'dark';
    clearAuthenticatedState();

    expect(portalState.theme).toBe('light');
    expect(getThemeSnapshot()).toMatchObject({ mode: 'light' });
  });

  it('认证后应使用服务端主题快照，保存成功后才通知子应用', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: [] }))
      .mockResolvedValueOnce(jsonResponse({ contractVersion: 1, mode: 'dark', customTokens: {}, updatedAt: '2026-08-12T08:00:00Z' }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-1' }))
      .mockResolvedValueOnce(jsonResponse({ contractVersion: 1, mode: 'custom', customTokens: {
        primary: '#1D4ED8', primaryHover: '#1E40AF', primaryActive: '#1E3A8A', primaryWeak: '#E0EAFF', primaryText: '#FFFFFF', canvas: '#F4F7FB', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSoft: '#EEF3F9', textPrimary: '#182230', textSecondary: '#5F6B7A', textDisabled: '#98A2B3', border: '#D9E1EC', borderStrong: '#B7C4D6', focusRing: '#2563EB', success: '#157347', successBg: '#DEF7E8', warning: '#9A5B00', warningBg: '#FFF4D6', danger: '#B42318', dangerBg: '#FEE4E2', info: '#175CD3', infoBg: '#E8F1FF', overlayScrim: '#0D192F'
      }, updatedAt: '2026-08-12T08:01:00Z' }));
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);

    await loadCurrentUser();
    const draft = getCustomThemeDraft();
    draft.primary = '#1D4ED8';
    await saveCustomThemeDraft(draft);

    expect(document.documentElement.dataset.iamTheme).toBe('custom');
    expect(getThemeSnapshot()).toMatchObject({ mode: 'custom', revision: expect.any(Number) });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/iam/web/theme-preference', { credentials: 'include', headers: {} });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/iam/web/theme-preference', {
      method: 'PUT',
      body: expect.any(String),
      credentials: 'include',
      headers: { 'X-CSRF-TOKEN': 'csrf-1', 'Content-Type': 'application/json' }
    });
    expect(listener).toHaveBeenCalledWith(getThemeSnapshot());

    unsubscribe();
  });

  it('当前模式为浅色但服务端仍返回色板时，编辑器草稿应回填资产而非清空', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: [] }))
      .mockResolvedValueOnce(jsonResponse({ contractVersion: 1, mode: 'light', customTokens: {
        primary: '#6D28D9', primaryHover: '#5B21B6', primaryActive: '#4C1D95', primaryWeak: '#EDE9FE', primaryText: '#FFFFFF', canvas: '#F5F3FF', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSoft: '#EDE9FE', textPrimary: '#1E1B4B', textSecondary: '#64748B', textDisabled: '#98A2B3', border: '#DDD6FE', borderStrong: '#C4B5FD', focusRing: '#7C3AED', success: '#15803D', successBg: '#DCFCE7', warning: '#A16207', warningBg: '#FEF9C3', danger: '#B91C1C', dangerBg: '#FEE2E2', info: '#1D4ED8', infoBg: '#DBEAFE', overlayScrim: '#0D192F'
      }, updatedAt: '2026-09-04T08:00:00Z' }))
      .mockResolvedValueOnce(jsonResponse([])));

    await loadCurrentUser();

    expect(portalState.theme).toBe('light');
    expect(document.documentElement.dataset.iamTheme).toBe('light');
    const draft = getCustomThemeDraft();
    expect(draft.primary).toBe('#6D28D9');
    expect(draft.canvas).toBe('#F5F3FF');

    clearAuthenticatedState();
    expect(getCustomThemeDraft().primary).not.toBe('#6D28D9');
  });

  it('主题保存失败应恢复最后一个已确认快照', async () => {
    initTheme();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-1' }))
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('保存失败') }));

    await expect(setTheme('dark')).rejects.toThrow('保存失败');

    expect(portalState.theme).toBe('light');
    expect(document.documentElement.dataset.iamTheme).toBe('light');
    expect(portalState.themeError).toBe('保存失败');
  });
});
