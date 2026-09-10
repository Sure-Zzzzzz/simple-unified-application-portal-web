import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CustomThemeEditor from './CustomThemeEditor.vue';
import { getThemeSnapshot, initTheme, portalState } from '../portalState';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

describe('CustomThemeEditor', () => {
  afterEach(() => {
    portalState.theme = 'light';
    initTheme();
    vi.restoreAllMocks();
  });

  it('非法颜色应展示校验错误且不应用主题', async () => {
    const wrapper = mount(CustomThemeEditor);
    await wrapper.get('[aria-label="主操作颜色值"]').setValue('#12');
    await wrapper.get('button.custom-theme-primary').trigger('click');

    expect(wrapper.get('[role="alert"]').text()).toContain('6 位十六进制');
    expect(getThemeSnapshot().mode).toBe('light');
  });

  it('应按分组渲染全部主题颜色令牌', () => {
    const wrapper = mount(CustomThemeEditor);
    const groups = wrapper.findAll('.custom-theme-group');
    const tokenCount = groups.reduce((sum, group) => sum + group.findAll('.custom-color-row').length, 0);

    expect(groups.map(group => group.get('h3').text())).toContain('遮罩浮层遮挡');
    expect(tokenCount).toBe(24);
    expect(wrapper.find('[aria-label="弹窗遮罩颜色值"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('关闭未应用的编辑应先确认，放弃后关闭且不改变主题', async () => {
    const close = vi.fn();
    const wrapper = mount(CustomThemeEditor, { props: { onClose: close } });
    await wrapper.get('[aria-label="主操作颜色值"]').setValue('#123456');
    await wrapper.get('button[aria-label="关闭自定义主题"]').trigger('click');

    expect(wrapper.get('[role="alertdialog"]').text()).toContain('放弃本次颜色调整');
    const discardButton = wrapper.findAll('button').find(button => button.text() === '放弃更改');
    await discardButton?.trigger('click');

    expect(close).toHaveBeenCalledTimes(1);
    expect(getThemeSnapshot().mode).toBe('light');
  });

  it('恢复默认后可继续编辑并应用，成功反馈保持可见', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-1' }))
      .mockResolvedValueOnce(jsonResponse({ contractVersion: 1, mode: 'custom', customTokens: {
        primary: '#1D4ED8', primaryHover: '#1E40AF', primaryActive: '#1E3A8A', primaryWeak: '#E0EAFF', primaryText: '#FFFFFF', canvas: '#F4F7FB', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSoft: '#EEF3F9', textPrimary: '#182230', textSecondary: '#5F6B7A', textDisabled: '#98A2B3', border: '#D9E1EC', borderStrong: '#B7C4D6', focusRing: '#2563EB', success: '#157347', successBg: '#DEF7E8', warning: '#9A5B00', warningBg: '#FFF4D6', danger: '#B42318', dangerBg: '#FEE4E2', info: '#175CD3', infoBg: '#E8F1FF', overlayScrim: '#0D192F'
      }, updatedAt: '2026-08-12T08:01:00Z' })));
    const wrapper = mount(CustomThemeEditor);
    await wrapper.get('[aria-label="主操作颜色值"]').setValue('#123456');
    const resetButton = wrapper.findAll('button').find(button => button.text() === '恢复默认');
    await resetButton?.trigger('click');
    expect((wrapper.get('[aria-label="主操作颜色值"]').element as HTMLInputElement).value).toBe('#1D4ED8');
    expect((wrapper.get('[aria-label="弹窗遮罩颜色值"]').element as HTMLInputElement).value).toBe('#0D192F');

    await wrapper.get('button.custom-theme-primary').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toContain('自定义主题已应用');
    expect(getThemeSnapshot().mode).toBe('custom');
    expect(getThemeSnapshot().customTokens.primary).toBe('#1D4ED8');
    expect(getThemeSnapshot().customTokens.overlayScrim).toBe('#0D192F');
    wrapper.unmount();
  });
});
