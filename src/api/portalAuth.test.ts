import { afterEach, describe, expect, it, vi } from 'vitest';
import { portalRequest, resolvePortalPresentationMode } from './portalAuth';

describe('portalAuth portalRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(responses: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const hit = Object.keys(responses).find(key => url.startsWith(key));
      return hit ? responses[hit] : responses['*'];
    }));
  }

  it('后端 JSON 错误体应提取 message 抛出', async () => {
    stubFetch({
      '/iam/web/auth/csrf': { ok: true, status: 200, json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-token' }) },
      '/iam/admin/departments/16': { ok: false, status: 409, text: () => Promise.resolve(JSON.stringify({ timestamp: '2026-09-01T12:00:00Z', message: '部门存在子部门，不能删除：research' })) }
    });

    await expect(portalRequest('/iam/admin/departments/16', { method: 'DELETE' })).rejects.toThrow('部门存在子部门，不能删除：research');
  });

  it('纯文本错误体（如网关错误）应保持原文抛出', async () => {
    stubFetch({
      '/iam/web/auth/csrf': { ok: true, status: 200, json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-token' }) },
      '/iam/web/theme-preference': { ok: false, status: 502, text: () => Promise.resolve('上游网关暂时不可用') }
    });

    await expect(portalRequest('/iam/web/theme-preference', { method: 'PUT', body: '{}' })).rejects.toThrow('上游网关暂时不可用');
  });

  it('200 空 body 成功响应应按无数据处理而非解析报错', async () => {
    stubFetch({
      '/iam/web/auth/csrf': { ok: true, status: 200, json: () => Promise.resolve({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-token' }) },
      '/iam/admin/users/2/roles/6': { ok: true, status: 200, text: () => Promise.resolve('') }
    });

    await expect(portalRequest('/iam/admin/users/2/roles/6', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('展示模式应只认最长匹配的 PAGE，旧数据和未命中保持标准布局', () => {
    const application = {
      applicationCode: 'report', applicationName: '报表中心', description: null, icon: null,
      routePrefix: '/app/report', entry: '/app/report/', apiBase: null, menuTree: [{
        code: 'reports', name: '报表', nodeType: 'GROUP' as const, icon: null, route: null,
        requiredPagePermission: null, presentationMode: 'STANDARD' as const, sortOrder: 1, children: [{
          code: 'report-root', name: '报表首页', nodeType: 'PAGE' as const, icon: null, route: '/app/report/reports',
          requiredPagePermission: null, presentationMode: 'STANDARD' as const, sortOrder: 1, children: []
        }, {
          code: 'monthly', name: '月度汇报', nodeType: 'PAGE' as const, icon: null, route: '/app/report/reports/monthly',
          requiredPagePermission: null, presentationMode: 'IMMERSIVE' as const, sortOrder: 2, children: []
        }]
      }]
    };

    expect(resolvePortalPresentationMode(application, '/app/report/reports/monthly/detail')).toBe('IMMERSIVE');
    expect(resolvePortalPresentationMode(application, '/app/report/reports')).toBe('STANDARD');
    expect(resolvePortalPresentationMode(application, '/app/report/unknown')).toBe('STANDARD');
    expect(resolvePortalPresentationMode(undefined, '/app/report/reports/monthly')).toBe('STANDARD');
  });
});
