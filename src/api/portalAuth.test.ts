import { afterEach, describe, expect, it, vi } from 'vitest';
import { portalRequest } from './portalAuth';

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
});
