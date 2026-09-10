import { flushPromises, mount } from '@vue/test-utils';
import { registerMicroApps } from 'qiankun';
import { createRouter, createWebHistory } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { configurePortalNavigator } from './api/portalAuth';
import { portalState, stopMessageEvents } from './portalState';
import MessageCenterView from './view/MessageCenterView.vue';
import MicroAppView from './view/MicroAppView.vue';

vi.mock('qiankun', () => ({
  registerMicroApps: vi.fn(),
  start: vi.fn()
}));

const accessibleApplications = [{
  applicationCode: 'iam',
  applicationName: '统一身份与访问管理',
  description: '身份、权限与消息中心',
  icon: 'access-control',
  routePrefix: '/app/iam',
  entry: 'http://localhost:5175',
  apiBase: null,
  menus: [
    { code: 'iam-dashboard', name: '工作台', route: '/app/iam', sortOrder: 0 },
    { code: 'iam-users', name: '组织与成员', route: '/app/iam/users', sortOrder: 1 },
    { code: 'iam-messages', name: '站内信', route: '/app/iam/messages', sortOrder: 2 }
  ]
}];

function successResponse(body: unknown, status = 200) {
  return { ok: true, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

function mountApp(path = '/app/iam') {
  window.history.pushState({}, '', path);
  const router = createRouter({
    history: createWebHistory('/app/'),
    routes: [
      { path: '/', component: MicroAppView },
      { path: '/inbox', component: MessageCenterView },
      { path: '/:pathMatch(.*)*', component: MicroAppView }
    ]
  });
  return mount(App, {
    global: {
      plugins: [router]
    }
  });
}

describe('Portal App', () => {
  beforeEach(() => {
    localStorage.clear();
    portalState.currentUser = null;
    portalState.authLoading = true;
    portalState.authError = '';
    portalState.applicationsLoading = false;
    portalState.applicationsError = '';
    portalState.applications = [];
    portalState.unreadCount = 0;
    portalState.messageEventStatus = 'idle';
    portalState.theme = 'light';
    portalState.activeAppCode = '';
    portalState.activeMenuCode = '';
    configurePortalNavigator();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    stopMessageEvents();
    vi.unstubAllGlobals();
  });

  it('启动后应读取服务端应用菜单并展示顶部用户区', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(3));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.get('.portal-logo').text()).toBe('统一应用门户');
    expect(wrapper.get('.portal-logo-mark').classes()).toContain('portal-logo-mark');
    expect(wrapper.text()).not.toContain('SURE统一认证平台');
    expect(wrapper.text()).not.toContain('Sure-Zzzzzz');
    expect(wrapper.text()).toContain('管理员');
    expect(wrapper.get('.message-icon').text()).toContain('3');
    expect(wrapper.get('.app-nav-item.active').text()).toContain('统一身份与访问管理');
    expect(wrapper.get('.app-subnav-item.active').text()).toContain('工作台');
    expect(wrapper.text()).toContain('组织与成员');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/iam/web/auth/me', {
      credentials: 'include',
      headers: {}
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/iam/web/theme-preference', {
      credentials: 'include',
      headers: {}
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/iam/web/portal/accessible-applications', {
      credentials: 'include',
      headers: {}
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/iam/web/messages/unread-count', {
      credentials: 'include',
      headers: {}
    });
    expect(registerMicroApps).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        name: 'iam',
        entry: 'http://localhost:5175',
        activeRule: '/app/iam',
        props: expect.objectContaining({
          apiBase: null,
          themeSnapshot: expect.objectContaining({ mode: 'light', revision: expect.any(Number) }),
          theme: expect.objectContaining({
            current: expect.any(Function),
            subscribe: expect.any(Function)
          }),
          request: expect.objectContaining({ request: expect.any(Function) })
        })
      })
    ]));
  });

  it('导航加载失败时应保留已认证用户壳并允许只重试导航', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce({ ok: false, status: 503, text: () => Promise.resolve('导航暂不可用') })
      .mockResolvedValueOnce(successResponse(0))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(3));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain('管理员');
    expect(wrapper.text()).toContain('导航暂不可用');
    expect(wrapper.find('.portal-empty-state').exists()).toBe(false);
    await wrapper.findAll('button').find(button => button.text() === '重试加载应用')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('组织与成员');
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/iam/web/portal/accessible-applications', {
      credentials: 'include',
      headers: {}
    });
  });

  it('认证读取失败时应提供重新验证会话入口', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: () => Promise.resolve('身份服务暂不可用') })
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(0));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain('身份服务暂不可用');
    await wrapper.findAll('button').find(button => button.text() === '重新验证会话')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('管理员');
    expect(wrapper.text()).toContain('组织与成员');
  });

  it('没有服务端 Portal 应用时应展示空态而不显示固定导航', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse([]))
      .mockResolvedValueOnce(successResponse(0));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.get('.portal-empty-state h1').text()).toBe('暂未配置可访问应用');
    expect(wrapper.find('.app-nav-item').exists()).toBe(false);
  });

  it('没有可访问应用的普通用户仍应能打开站内信收件箱', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/me')) {
        return Promise.resolve(successResponse({ userId: 2, username: 'reader', displayName: '普通用户', admin: false, authorities: [] }));
      }
      if (url.includes('theme-preference')) {
        return Promise.resolve(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }));
      }
      if (url.includes('accessible-applications')) {
        return Promise.resolve(successResponse([]));
      }
      if (url.includes('unread-count')) {
        return Promise.resolve(successResponse(0));
      }
      if (url.includes('/messages/page')) {
        return Promise.resolve(successResponse({ content: [], totalElements: 0, totalPages: 0, page: 1, size: 20, numberOfElements: 0, first: true, last: true, empty: true }));
      }
      return Promise.reject(new Error(`未预期的请求：${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp('/app/inbox');
    await flushPromises();

    expect(wrapper.find('.portal-empty-state').exists()).toBe(false);
    expect(wrapper.get('.message-center h2').text()).toBe('站内信');
    expect(fetchMock).toHaveBeenCalledWith('/iam/web/messages/unread-count', {
      credentials: 'include',
      headers: {}
    });
    wrapper.unmount();
  });

  it('未登录访问 portal 应跳转登录并携带当前地址', async () => {
    const navigate = vi.fn();
    configurePortalNavigator(navigate);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('') }));

    mountApp();
    await flushPromises();

    expect(navigate).toHaveBeenCalledWith('/login?redirect=%2Fapp%2Fiam');
  });

  it('站内信入口应进入门户收件箱而不激活子应用路由', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(2))
      .mockResolvedValueOnce(successResponse({ content: [], totalElements: 0, totalPages: 0, page: 1, size: 20, numberOfElements: 0, first: true, last: true, empty: true }));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('.message-icon').trigger('click');
    await flushPromises();

    expect(window.location.pathname).toBe('/app/inbox');
    expect(portalState.activeAppCode).toBe('');
    wrapper.unmount();
  });

  it('实时未读更新故障时应提供非阻塞的重新连接入口', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(0))
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse(4));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();
    portalState.messageEventStatus = 'error';
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('实时更新暂不可用');
    await wrapper.findAll('button').find(button => button.text() === '重新连接')!.trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenNthCalledWith(5, '/iam/web/auth/me', {
      credentials: 'include',
      headers: {}
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/iam/web/messages/unread-count', {
      credentials: 'include',
      headers: {}
    });
  });

  it('点击用户区应展示下拉菜单并可统一退出登录', async () => {
    const navigate = vi.fn();
    configurePortalNavigator(navigate);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(0))
      .mockResolvedValueOnce(successResponse({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-1' }))
      .mockResolvedValueOnce(successResponse({}, 204));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('.user-trigger').trigger('click');
    await wrapper.get('.logout-button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('主题');
    expect(wrapper.text()).not.toContain('个人信息');
    expect(wrapper.text()).toContain('修改密码');
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/iam/web/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-TOKEN': 'csrf-1' }
    });
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('用户下拉应提供修改密码入口并跳转登录侧改密页', async () => {
    const navigate = vi.fn();
    configurePortalNavigator(navigate);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(0)));

    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('.user-trigger').trigger('click');

    const changePasswordButton = wrapper.findAll('.user-dropdown-menu button')
      .find(button => button.text() === '修改密码');
    expect(changePasswordButton).toBeDefined();
    await changePasswordButton!.trigger('click');

    expect(navigate).toHaveBeenCalledWith(`/change-password?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  });

  it('Portal 根路径应替换为第一个可访问菜单', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(0)));

    mountApp('/app/');
    await flushPromises();

    expect(window.location.pathname).toBe('/app/iam');
    expect(portalState.activeAppCode).toBe('iam');
    expect(portalState.activeMenuCode).toBe('iam-dashboard');
  });

  it('已指定的应用深链应保持不变', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(0)));

    mountApp('/app/iam/users');
    await flushPromises();

    expect(window.location.pathname).toBe('/app/iam/users');
    expect(portalState.activeMenuCode).toBe('iam-users');
  });

  it('微前端页面不应渲染无依据状态或重复 Portal 标题', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(accessibleApplications))
      .mockResolvedValueOnce(successResponse(0)));

    const wrapper = mountApp('/app/iam');
    await flushPromises();

    expect(wrapper.text()).not.toContain('已连接');
    expect(wrapper.find('.portal-context').exists()).toBe(false);
  });
});
