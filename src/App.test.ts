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

function navigationContext(applications: unknown[], loginLandingApplicationCode: string | null = null) {
  return { applications, loginLandingApplicationCode };
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
    portalState.loginLandingApplicationCode = null;
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
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
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
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/iam/web/portal/navigation-context', {
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

  it('应用根节点可独立折叠菜单，图标轨可恢复当前菜单树', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
      .mockResolvedValueOnce(successResponse(0));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();

    const applicationRoot = wrapper.get('.app-nav-item');
    expect(applicationRoot.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('.app-subnav').isVisible()).toBe(true);
    await applicationRoot.trigger('click');

    expect(applicationRoot.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.app-subnav').exists()).toBe(false);
    expect(localStorage.getItem('simple-iam-portal-expanded-application-menus')).toBe('[]');
    await applicationRoot.trigger('click');

    const toggle = wrapper.get('.navigation-rail-toggle');
    expect(toggle.attributes('aria-label')).toBe('收起侧栏');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    await toggle.trigger('click');

    expect(wrapper.get('.portal-body').classes()).toContain('sidebar-collapsed');
    expect(toggle.attributes('aria-label')).toBe('展开侧栏');
    expect(toggle.attributes('aria-pressed')).toBe('true');
    expect(localStorage.getItem('simple-iam-portal-navigation-collapsed')).toBe('true');
    await applicationRoot.trigger('click');
    expect(wrapper.get('.portal-body').classes()).not.toContain('sidebar-collapsed');
    wrapper.unmount();
  });

  it('应优先渲染递归 menuTree，并为深链接自动展开祖先分组', async () => {
    const treeApplications = [{
      applicationCode: 'iam', applicationName: '统一身份与访问管理', description: '身份、权限与消息中心', icon: 'access-control',
      routePrefix: '/app/iam', entry: 'http://localhost:5175', apiBase: null, menus: [],
      menuTree: [{
        code: 'directory', name: '目录管理', nodeType: 'GROUP', icon: null, route: null, requiredPagePermission: null, sortOrder: 1,
        children: [{
          code: 'iam-users', name: '组织与成员', nodeType: 'PAGE', icon: 'users', route: '/app/iam/users', requiredPagePermission: 'iam:user:page', sortOrder: 1, children: []
        }]
      }]
    }];
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(navigationContext(treeApplications)))
      .mockResolvedValueOnce(successResponse(0)));

    const wrapper = mountApp('/app/iam/users');
    await flushPromises();

    const group = wrapper.get('.app-subnav-group');
    expect(group.text()).toContain('目录管理');
    expect(group.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('.app-subnav-item.active').text()).toContain('组织与成员');
    expect(wrapper.find('.app-subnav-item .lucide-folder-tree').exists()).toBe(true);
    expect(wrapper.find('.app-subnav-item .lucide-users').exists()).toBe(true);
    await group.trigger('click');
    expect(group.attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('.app-subnav-item.active')).toHaveLength(0);
  });

  it('IAM 仪表盘沉浸展示，下钻标准管理页时恢复 Portal 壳', async () => {
    const immersiveApplications = [{
      applicationCode: 'iam', applicationName: 'IAM 管理台', description: '身份治理总览', icon: 'access-control',
      routePrefix: '/app/iam', entry: 'http://localhost:5175', apiBase: null, menus: [], menuTree: [{
        code: 'dashboard', name: '仪表盘', nodeType: 'PAGE', icon: 'dashboard', route: '/app/iam',
        requiredPagePermission: null, presentationMode: 'IMMERSIVE', sortOrder: 1, children: []
      }, {
        code: 'users', name: '用户管理', nodeType: 'PAGE', icon: 'users', route: '/app/iam/users',
        requiredPagePermission: 'iam:user:page', presentationMode: 'STANDARD', sortOrder: 2, children: []
      }]
    }];
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(navigationContext(immersiveApplications)))
      .mockResolvedValueOnce(successResponse(0)));

    const wrapper = mountApp('/app/iam');
    await flushPromises();

    expect(wrapper.find('.portal-shell').classes()).toContain('portal-shell--immersive');
    expect(wrapper.find('.portal-topbar').exists()).toBe(false);
    expect(wrapper.find('.app-sidebar').exists()).toBe(false);
    expect(wrapper.find('.micro-app-stage').exists()).toBe(true);
    window.history.pushState({}, '', '/app/iam/users');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flushPromises();
    expect(wrapper.find('.portal-topbar').exists()).toBe(true);
    expect(wrapper.find('.app-sidebar').exists()).toBe(true);
    wrapper.unmount();
  });

  it('启动时应恢复已保存的桌面导航折叠状态', async () => {
    localStorage.setItem('simple-iam-portal-navigation-collapsed', 'true');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
      .mockResolvedValueOnce(successResponse(0));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.get('.portal-body').classes()).toContain('sidebar-collapsed');
    expect(wrapper.get('.navigation-rail-toggle').attributes('aria-label')).toBe('展开侧栏');
    wrapper.unmount();
  });

  it('多个应用根节点应分别控制自己的模块菜单', async () => {
    const applications = [...accessibleApplications, {
      applicationCode: 'aksk',
      applicationName: 'AKSK 管理',
      description: '访问密钥管理',
      icon: 'key-round',
      routePrefix: '/app/aksk',
      entry: 'http://localhost:5177',
      apiBase: '/api',
      menus: [{ code: 'aksk-clients', name: '客户端管理', route: '/app/aksk/clients', sortOrder: 0 }]
    }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(navigationContext(applications)))
      .mockResolvedValueOnce(successResponse(0));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountApp();
    await flushPromises();

    const roots = wrapper.findAll('.app-nav-item');
    expect(roots).toHaveLength(2);
    expect(roots[0].attributes('aria-expanded')).toBe('true');
    expect(roots[1].attributes('aria-expanded')).toBe('false');
    await roots[1].trigger('click');

    expect(roots[0].attributes('aria-expanded')).toBe('true');
    expect(roots[1].attributes('aria-expanded')).toBe('true');
    await roots[0].trigger('click');
    expect(roots[0].attributes('aria-expanded')).toBe('false');
    expect(roots[1].attributes('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('导航加载失败时应保留已认证用户壳并允许只重试导航', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce({ ok: false, status: 503, text: () => Promise.resolve('导航暂不可用') })
      .mockResolvedValueOnce(successResponse(0))
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
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
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/iam/web/portal/navigation-context', {
      credentials: 'include',
      headers: {}
    });
  });

  it('认证读取失败时应提供重新验证会话入口', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: () => Promise.resolve('身份服务暂不可用') })
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
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
      .mockResolvedValueOnce(successResponse(navigationContext([])))
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
      if (url.includes('navigation-context')) {
        return Promise.resolve(successResponse(navigationContext([])));
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
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
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
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
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
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
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
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
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
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
      .mockResolvedValueOnce(successResponse(0)));

    mountApp('/app/');
    await flushPromises();

    expect(window.location.pathname).toBe('/app/iam');
    expect(portalState.activeAppCode).toBe('iam');
    expect(portalState.activeMenuCode).toBe('iam-dashboard');
  });

  it('Portal 根路径应优先进入全局登录首页应用的静态默认子路径', async () => {
    const reportApplication = {
      applicationCode: 'report',
      applicationName: '报表中心',
      description: null,
      icon: 'report',
      routePrefix: '/app/report',
      entry: 'http://localhost:5177',
      apiBase: null,
      defaultEntry: { pageMenuCode: 'report-home', path: '/reports/overview' },
      menus: [{ code: 'report-home', name: '报表首页', route: '/app/report/reports', sortOrder: 0 }]
    };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse({
        applications: [accessibleApplications[0], reportApplication],
        loginLandingApplicationCode: 'report'
      }))
      .mockResolvedValueOnce(successResponse(0)));

    mountApp('/app/');
    await flushPromises();

    expect(window.location.pathname).toBe('/app/report/reports/overview');
    expect(portalState.activeAppCode).toBe('report');
    expect(portalState.activeMenuCode).toBe('report-home');
  });

  it('应用根路径应进入本应用默认入口，已指定的深链保持不变', async () => {
    const application = {
      ...accessibleApplications[0],
      defaultEntry: { pageMenuCode: 'iam-users', path: '/users/invite' }
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse({ applications: [application], loginLandingApplicationCode: null }))
      .mockResolvedValueOnce(successResponse(0));
    vi.stubGlobal('fetch', fetchMock);

    mountApp('/app/iam');
    await flushPromises();

    expect(window.location.pathname).toBe('/app/iam/users/invite');
    expect(portalState.activeMenuCode).toBe('iam-users');
  });

  it('已指定的应用深链应保持不变', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(successResponse({ userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] }))
      .mockResolvedValueOnce(successResponse({ contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null }))
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
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
      .mockResolvedValueOnce(successResponse(navigationContext(accessibleApplications)))
      .mockResolvedValueOnce(successResponse(0)));

    const wrapper = mountApp('/app/iam');
    await flushPromises();

    expect(wrapper.text()).not.toContain('已连接');
    expect(wrapper.find('.portal-context').exists()).toBe(false);
  });
});
