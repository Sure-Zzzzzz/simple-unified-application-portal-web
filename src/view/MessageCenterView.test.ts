import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageCenterView from './MessageCenterView.vue';
import type { IamMessage } from '../api/portalAuth';
import { portalState } from '../portalState';

const unreadMessage: IamMessage = {
  id: 1,
  recipientUserId: 10,
  senderUserId: 1,
  senderUsername: 'admin',
  title: '系统通知',
  content: '请及时处理。',
  sendBatchId: null,
  targetSummary: null,
  read: false,
  readAt: null,
  createdAt: '2026-08-10T08:00:00Z'
};

function pageResponse(content = [unreadMessage], page = 1, totalPages = 1) {
  return {
    content,
    totalElements: totalPages > 1 ? 11 : content.length,
    totalPages,
    page,
    size: 10,
    numberOfElements: content.length,
    first: page === 1,
    last: page === totalPages,
    empty: content.length === 0
  };
}

function successResponse(body: unknown, status = 200) {
  return { ok: true, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

function failureResponse(message: string) {
  return { ok: false, status: 503, text: () => Promise.resolve(message) };
}

describe('MessageCenterView', () => {
  beforeEach(() => {
    portalState.messages = [];
    portalState.messagesPage = 1;
    portalState.messagesTotalPages = 0;
    portalState.messagesTotal = 0;
    portalState.messagesPageSize = 10;
    portalState.messagesLoading = false;
    portalState.messagesError = '';
    portalState.messageActionLoading = false;
    portalState.unreadCount = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('首次加载后展示列表，打开未读消息时标记已读并展示详情', async () => {
    const updated = { ...unreadMessage, read: true, readAt: '2026-08-10T08:01:00Z' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse(pageResponse()))
      .mockResolvedValueOnce(successResponse({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-1' }))
      .mockResolvedValueOnce(successResponse(updated))
      .mockResolvedValueOnce(successResponse(0));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(MessageCenterView);
    await flushPromises();

    expect(wrapper.text()).toContain('系统通知');
    expect(wrapper.get('.message-card').classes()).toContain('unread');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/iam/web/messages/page?page=1&size=10', {
      credentials: 'include',
      headers: {}
    });

    await wrapper.get('.message-card').trigger('click');
    await flushPromises();

    expect(wrapper.get('.message-detail').text()).toContain('请及时处理。');
    expect(portalState.messages[0].read).toBe(true);
    expect(portalState.unreadCount).toBe(0);
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/iam/web/messages/1/read', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'X-CSRF-TOKEN': 'csrf-1' }
    });
  });

  it('全部标记已读后重新加载当前页并刷新未读数', async () => {
    const readMessage = { ...unreadMessage, read: true, readAt: '2026-08-10T08:01:00Z' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse(pageResponse()))
      .mockResolvedValueOnce(successResponse({ headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token: 'csrf-1' }))
      .mockResolvedValueOnce(successResponse({}, 204))
      .mockResolvedValueOnce(successResponse(pageResponse([readMessage])))
      .mockResolvedValueOnce(successResponse(0));
    vi.stubGlobal('fetch', fetchMock);
    portalState.unreadCount = 1;

    const wrapper = mount(MessageCenterView);
    await flushPromises();
    await wrapper.get('.message-center-action').trigger('click');
    await flushPromises();

    expect(portalState.messages[0].read).toBe(true);
    expect(portalState.unreadCount).toBe(0);
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/iam/web/messages/read-all', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'X-CSRF-TOKEN': 'csrf-1' }
    });
  });

  it('支持翻页，并在没有消息时展示空态', async () => {
    const secondPageMessage = { ...unreadMessage, id: 2, title: '第二页通知', read: true };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse(pageResponse([unreadMessage], 1, 2)))
      .mockResolvedValueOnce(successResponse(pageResponse([secondPageMessage], 2, 2)));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(MessageCenterView);
    await flushPromises();
    await wrapper.get('.pagination-pages button:last-child').trigger('click');
    await flushPromises();

    expect(portalState.messagesPage).toBe(2);
    expect(wrapper.text()).toContain('第二页通知');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/iam/web/messages/page?page=2&size=10', {
      credentials: 'include',
      headers: {}
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successResponse(pageResponse([]))));
    const emptyWrapper = mount(MessageCenterView);
    await flushPromises();
    expect(emptyWrapper.text()).toContain('暂无站内信');
  });

  it('切换每页条数应回到第一页并按新条数重新拉取', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse(pageResponse([unreadMessage], 1, 2)))
      .mockResolvedValueOnce(successResponse(pageResponse([unreadMessage], 1, 1)));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(MessageCenterView);
    await flushPromises();

    await wrapper.get('select').setValue('20');
    await flushPromises();

    expect(portalState.messagesPageSize).toBe(20);
    expect(portalState.messagesPage).toBe(1);
    expect(fetchMock).toHaveBeenLastCalledWith('/iam/web/messages/page?page=1&size=20', {
      credentials: 'include',
      headers: {}
    });
  });

  it('SSE 新消息信号应保持当前页重载列表，加载中不重入', async () => {
    portalState.messageVersion = 0;
    const reloadBody = { ...unreadMessage, id: 3, title: '实时新通知' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse(pageResponse([unreadMessage], 1, 2)))
      .mockResolvedValueOnce(successResponse(pageResponse([unreadMessage], 2, 2)))
      .mockResolvedValueOnce(successResponse(pageResponse([reloadBody], 2, 2)));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(MessageCenterView);
    await flushPromises();
    await wrapper.get('.pagination-pages button:last-child').trigger('click');
    await flushPromises();
    expect(portalState.messagesPage).toBe(2);

    portalState.messageVersion += 1;
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith('/iam/web/messages/page?page=2&size=10', {
      credentials: 'include',
      headers: {}
    });
    expect(wrapper.text()).toContain('实时新通知');

    portalState.messagesLoading = true;
    portalState.messageVersion += 1;
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('加载失败时展示错误并可重试', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failureResponse('消息服务暂不可用'))
      .mockResolvedValueOnce(successResponse(pageResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mount(MessageCenterView);
    await flushPromises();

    expect(wrapper.text()).toContain('消息服务暂不可用');
    await wrapper.get('.message-center-error button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('系统通知');
    expect(portalState.messagesError).toBe('');
  });
});
