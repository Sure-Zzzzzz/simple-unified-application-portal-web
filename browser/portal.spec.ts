import { expect, test } from '@playwright/test';

const user = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const applications = [{
  applicationCode: 'iam', applicationName: 'IAM 管理台', description: 'IAM 平台内置管理台，负责用户、组织、角色权限与可信应用的统一管理', icon: 'access-control',
  routePrefix: '/app/iam', entry: 'http://127.0.0.1:5175', apiBase: null, menus: [
    { code: 'iam-dashboard', name: '工作台', route: '/app/iam', sortOrder: 0 }
  ]
}, {
  applicationCode: 'aksk', applicationName: 'AKSK 管理', description: 'AKSK 访问凭证管理（客户端、授权与令牌）', icon: 'key-round',
  routePrefix: '/app/aksk', entry: 'http://127.0.0.1:5177', apiBase: '/api', menus: [
    { code: 'aksk-clients', name: '客户端管理', route: '/app/aksk/clients', sortOrder: 0 }
  ]
}];

test('生产构建中 Portal 可切换受控主题并保留可访问应用', async ({ page }) => {
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/theme-preference', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null } });
      return;
    }
    await route.fulfill({ json: {
      contractVersion: 1,
      mode: 'custom',
      customTokens: {
        primary: '#1D4ED8', primaryHover: '#1E40AF', primaryActive: '#1E3A8A', primaryWeak: '#E0EAFF', primaryText: '#FFFFFF', canvas: '#F4F7FB', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSoft: '#EEF3F9', textPrimary: '#182230', textSecondary: '#5F6B7A', textDisabled: '#98A2B3', border: '#D9E1EC', borderStrong: '#B7C4D6', focusRing: '#2563EB', success: '#157347', successBg: '#DEF7E8', warning: '#9A5B00', warningBg: '#FFF4D6', danger: '#B42318', dangerBg: '#FEE4E2', info: '#175CD3', infoBg: '#E8F1FF'
      },
      updatedAt: '2026-08-12T09:00:00Z'
    } });
  });
  await page.route('**/iam/web/auth/csrf', route => route.fulfill({ json: {
    headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-token'
  } }));
  await page.route('**/iam/web/portal/navigation-context', route => route.fulfill({ json: {
    applications,
    loginLandingApplicationCode: null
  } }));
  await page.route('**/iam/web/messages/unread-count', route => route.fulfill({ json: 0 }));

  await page.setViewportSize({ width: 1024, height: 960 });
  await page.goto('/app/iam');
  await expect.poll(() => page.evaluate(() => ({
    app: document.querySelector('#app')?.getBoundingClientRect().width,
    shell: document.querySelector('.portal-shell')?.getBoundingClientRect().width,
    body: document.querySelector('.portal-body')?.getBoundingClientRect().width,
    viewport: window.innerWidth
  }))).toEqual({ app: 1024, shell: 1024, body: 1024, viewport: 1024 });
  await page.getByRole('button', { name: /管理员/ }).click();
  await page.getByRole('button', { name: '自定义' }).click();
  await expect(page.getByRole('dialog', { name: '自定义主题' })).toBeVisible();
  await expect(page.getByText('仅调整颜色，不会改变页面布局和文字内容。')).toBeVisible();
  await page.getByRole('button', { name: '应用主题' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-iam-theme', 'custom');
  await page.getByRole('button', { name: '关闭自定义主题' }).click();
  const navigation = page.getByRole('navigation', { name: '应用导航' });
  await expect(navigation).toContainText('IAM 管理台');
  await expect(navigation).toContainText('AKSK 管理');
  await expect.poll(() => page.locator('.app-nav-item').evaluateAll((roots) => {
    const sidebarRight = document.querySelector('.app-sidebar')!.getBoundingClientRect().right;
    return roots.every((root) => root.getBoundingClientRect().right <= sidebarRight);
  })).toBe(true);
  await expect.poll(() => page.locator('.app-nav-item small').evaluateAll((descriptions) => descriptions.every((description) => (
    description.scrollWidth <= description.clientWidth && description.scrollHeight <= description.clientHeight
  )))).toBe(true);
  await expect.poll(() => page.locator('.app-nav-copy').evaluateAll((copies) => copies.every((copy) => {
    const title = copy.querySelector('strong')!;
    const description = copy.querySelector('small')!;
    return getComputedStyle(copy).display === 'grid'
      && description.getBoundingClientRect().top >= title.getBoundingClientRect().bottom;
  }))).toBe(true);
  const applicationRoot = page.getByRole('button', { name: 'IAM 管理台，收起模块菜单' });

  await applicationRoot.click();
  await expect(page.getByRole('button', { name: 'IAM 管理台，展开模块菜单' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: '工作台' })).toHaveCount(0);
  await page.getByRole('button', { name: 'IAM 管理台，展开模块菜单' }).click();

  await page.getByRole('button', { name: '收起侧栏' }).click();
  await expect(page.getByRole('button', { name: '展开侧栏' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => navigation.evaluate(element => element.getBoundingClientRect().width)).toBe(64);
  await expect.poll(() => page.locator('.app-nav-item').evaluateAll((roots) => roots.every((root) => (
    root.getBoundingClientRect().width === 44 && root.getBoundingClientRect().height === 44
  )))).toBe(true);
  await expect.poll(() => page.locator('.app-nav-icon').evaluateAll((icons) => icons.every((icon) => (
    icon.getBoundingClientRect().width === 36 && icon.getBoundingClientRect().height === 36
  )))).toBe(true);
  await expect(page.locator('.app-nav-copy').first()).toBeHidden();
  await expect(page.locator('.app-subnav').first()).toBeHidden();
  await expect.poll(() => page.locator('.navigation-rail-toggle').evaluate((toggle) => {
    const toggleBounds = toggle.getBoundingClientRect();
    const navigationTop = 64;
    const visibleNavigationMiddle = navigationTop + (window.innerHeight - navigationTop) / 2;
    return Math.abs((toggleBounds.top + toggleBounds.bottom) / 2 - visibleNavigationMiddle) <= 1;
  })).toBe(true);
  await page.getByRole('button', { name: 'IAM 管理台，收起模块菜单' }).click();
  await expect.poll(() => navigation.evaluate(element => element.getBoundingClientRect().width)).toBe(264);

  await page.setViewportSize({ width: 800, height: 960 });
  await expect(page.locator('.navigation-rail-toggle')).toBeHidden();
  await page.getByRole('button', { name: '切换应用导航' }).click();
  await expect.poll(() => navigation.evaluate(element => element.classList.contains('open'))).toBe(true);
  await expect(page.getByText('IAM 管理台')).toBeVisible();
  await page.getByRole('button', { name: 'IAM 管理台，收起模块菜单' }).click();
  await expect(page.getByRole('button', { name: '工作台' })).toHaveCount(0);
});

test('IAM 仪表盘沉浸展示，下钻标准管理页时恢复门户壳', async ({ page }) => {
  const dashboardApplication = [{
    applicationCode: 'iam', applicationName: 'IAM 管理台', description: '身份治理总览', icon: 'access-control',
    routePrefix: '/app/iam', entry: 'http://127.0.0.1:5175', apiBase: null, menus: [], menuTree: [{
      code: 'dashboard', name: '仪表盘', nodeType: 'PAGE', icon: 'dashboard', route: '/app/iam',
      requiredPagePermission: null, presentationMode: 'IMMERSIVE', sortOrder: 1, children: []
    }, {
      code: 'users', name: '用户管理', nodeType: 'PAGE', icon: 'users', route: '/app/iam/users',
      requiredPagePermission: 'iam:user:page', presentationMode: 'STANDARD', sortOrder: 2, children: []
    }]
  }];
  await page.route('**/iam/web/auth/me', route => route.fulfill({ json: user }));
  await page.route('**/iam/web/theme-preference', route => route.fulfill({ json: {
    contractVersion: 1, mode: 'light', customTokens: {}, updatedAt: null
  } }));
  await page.route('**/iam/web/portal/navigation-context', route => route.fulfill({ json: {
    applications: dashboardApplication,
    loginLandingApplicationCode: null
  } }));
  await page.route('**/iam/web/messages/unread-count', route => route.fulfill({ json: 0 }));

  await page.goto('/app/iam');
  await expect(page.locator('.portal-shell')).toHaveClass(/portal-shell--immersive/);
  await expect(page.locator('.portal-topbar')).toHaveCount(0);
  await expect(page.locator('.app-sidebar')).toHaveCount(0);

  await page.goto('/app/iam/users');
  await expect(page.locator('.portal-shell')).not.toHaveClass(/portal-shell--immersive/);
  await expect(page.locator('.portal-topbar')).toBeVisible();
  await expect(page.locator('.app-sidebar')).toBeVisible();
});
