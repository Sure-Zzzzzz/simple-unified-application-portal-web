import { expect, test } from '@playwright/test';

const user = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: ['ROLE_iam_admin'] };
const applications = [{
  applicationCode: 'iam', applicationName: '统一身份与访问管理', description: '身份与权限管理', icon: 'access-control',
  routePrefix: '/app/iam', entry: 'http://127.0.0.1:5175', apiBase: null, menus: []
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
  await page.route('**/iam/web/portal/accessible-applications', route => route.fulfill({ json: applications }));
  await page.route('**/iam/web/messages/unread-count', route => route.fulfill({ json: 0 }));

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/app/iam');
  await expect.poll(() => page.evaluate(() => ({
    app: document.querySelector('#app')?.getBoundingClientRect().width,
    shell: document.querySelector('.portal-shell')?.getBoundingClientRect().width,
    body: document.querySelector('.portal-body')?.getBoundingClientRect().width,
    viewport: window.innerWidth
  }))).toEqual({ app: 1440, shell: 1440, body: 1440, viewport: 1440 });
  await page.getByRole('button', { name: /管理员/ }).click();
  await page.getByRole('button', { name: '自定义' }).click();
  await expect(page.getByRole('dialog', { name: '自定义主题' })).toBeVisible();
  await expect(page.getByText('仅调整颜色，不会改变页面布局和文字内容。')).toBeVisible();
  await page.getByRole('button', { name: '应用主题' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-iam-theme', 'custom');
  await expect(page.getByRole('navigation', { name: '应用导航' })).toContainText('统一身份与访问管理');
});
