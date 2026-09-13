export interface CsrfTokenResponse {
  headerName: string;
  parameterName: string;
  token: string;
}

export interface AuthUser {
  userId: number | null;
  username: string;
  displayName: string | null;
  admin: boolean;
  authorities: string[];
}

export interface PortalMenuItem {
  code: string;
  name: string;
  route: string;
  sortOrder: number;
}

export type PortalMenuNodeType = 'GROUP' | 'PAGE';

export type PortalPresentationMode = 'STANDARD' | 'IMMERSIVE';

export interface PortalAccessibleMenuTreeNode {
  code: string;
  name: string;
  nodeType: PortalMenuNodeType;
  icon: string | null;
  route: string | null;
  requiredPagePermission: string | null;
  /** 旧服务端不返回时按 STANDARD 处理。 */
  presentationMode?: PortalPresentationMode | null;
  sortOrder: number;
  children: PortalAccessibleMenuTreeNode[];
}

export interface PortalAccessibleApplication {
  applicationCode: string;
  applicationName: string;
  description: string | null;
  icon: string | null;
  routePrefix: string;
  entry: string;
  apiBase: string | null;
  /** 1.0 compatibility projection containing PAGE leaves only. */
  menus?: PortalMenuItem[];
  /** 1.1 recursive navigation model. */
  menuTree?: PortalAccessibleMenuTreeNode[];
  /** 当前用户可访问的应用根路由默认入口。 */
  defaultEntry?: PortalDefaultEntry | null;
}

export interface PortalDefaultEntry {
  pageMenuCode: string;
  path: string;
}

export interface PortalNavigationContext {
  applications: PortalAccessibleApplication[];
  loginLandingApplicationCode: string | null;
}

export function getApplicationMenuTree(application: PortalAccessibleApplication): PortalAccessibleMenuTreeNode[] {
  if (Array.isArray(application.menuTree)) {
    return application.menuTree;
  }
  return (application.menus || []).map(item => ({
    code: item.code,
    name: item.name,
    nodeType: 'PAGE',
    icon: null,
    route: item.route,
    requiredPagePermission: null,
    presentationMode: 'STANDARD',
    sortOrder: item.sortOrder,
    children: []
  }));
}

export function flattenApplicationPages(application: PortalAccessibleApplication): PortalMenuItem[] {
  const pages: PortalMenuItem[] = [];
  const visit = (nodes: PortalAccessibleMenuTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.nodeType === 'PAGE' && node.route) {
        pages.push({ code: node.code, name: node.name, route: node.route, sortOrder: node.sortOrder });
      }
      visit(node.children || []);
    });
  };
  visit(getApplicationMenuTree(application));
  return pages;
}

/**
 * 仅用 IAM 已按当前用户权限裁剪后的 PAGE 菜单决定 Portal 宿主布局。
 * 路由的最长前缀优先，避免 /reports 抢占 /reports/monthly 等更具体页面。
 */
export function resolvePortalPresentationMode(
  application: PortalAccessibleApplication | undefined,
  pathname: string
): PortalPresentationMode {
  if (!application) {
    return 'STANDARD';
  }
  let matchedRouteLength = -1;
  let matchedMode: PortalPresentationMode = 'STANDARD';
  const visit = (nodes: PortalAccessibleMenuTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.nodeType === 'PAGE' && node.route
        && (pathname === node.route || pathname.startsWith(`${node.route}/`))
        && node.route.length > matchedRouteLength) {
        matchedRouteLength = node.route.length;
        matchedMode = node.presentationMode === 'IMMERSIVE' ? 'IMMERSIVE' : 'STANDARD';
      }
      visit(node.children || []);
    });
  };
  visit(getApplicationMenuTree(application));
  return matchedMode;
}

export interface PortalThemePreference {
  contractVersion: number;
  mode: 'light' | 'dark' | 'custom';
  customTokens: Record<string, string>;
  updatedAt: string | null;
}

export interface PortalThemePreferenceInput {
  contractVersion: number;
  mode: 'light' | 'dark' | 'custom';
  customTokens: Record<string, string>;
}

export interface IamMessage {
  id: number;
  recipientUserId: number;
  senderUserId: number;
  senderUsername: string;
  title: string;
  content: string;
  sendBatchId: string | null;
  targetSummary: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('未登录');
  }
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return portalRequest('/iam/web/auth/me');
}

export interface IamMessagePage {
  content: IamMessage[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export async function fetchMessages(page = 1, size = 20): Promise<IamMessagePage> {
  return portalRequest(`/iam/web/messages/page?page=${Math.max(page, 1)}&size=${Math.min(Math.max(size, 1), 100)}`);
}

export async function markMessageRead(messageId: number): Promise<IamMessage> {
  return portalRequest(`/iam/web/messages/${messageId}/read`, { method: 'PUT' });
}

export async function markAllMessagesRead(): Promise<void> {
  await portalRequest('/iam/web/messages/read-all', { method: 'PUT' });
}

export async function fetchUnreadMessageCount(): Promise<number> {
  return portalRequest('/iam/web/messages/unread-count');
}

export async function fetchAccessibleApplications(): Promise<PortalAccessibleApplication[]> {
  return portalRequest('/iam/web/portal/accessible-applications');
}

export async function fetchPortalNavigationContext(): Promise<PortalNavigationContext> {
  return portalRequest('/iam/web/portal/navigation-context');
}

export function isPortalHttpNotFound(error: unknown): boolean {
  return error instanceof Error && (error as Error & { httpStatus?: number }).httpStatus === 404;
}

export async function fetchThemePreference(): Promise<PortalThemePreference> {
  return portalRequest('/iam/web/theme-preference');
}

export async function saveThemePreference(input: PortalThemePreferenceInput): Promise<PortalThemePreference> {
  return portalRequest('/iam/web/theme-preference', {
    method: 'PUT',
    body: JSON.stringify(input)
  });
}

export async function logout(): Promise<void> {
  await portalRequest('/iam/web/auth/logout', { method: 'POST' });
}

export async function fetchCsrfToken(): Promise<CsrfTokenResponse> {
  const response = await fetch('/iam/web/auth/csrf', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('获取 CSRF Token 失败');
  }
  return response.json();
}

export async function portalRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined)
  };
  const hasBody = init.body !== undefined;
  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = await fetchCsrfToken();
    headers[csrf.headerName] = csrf.token;
  }
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers
  });
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (response.status === 404) {
    const body = await response.text();
    let message = '';
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string' && parsed.message) message = parsed.message;
    } catch {
      // 无响应体（如授权规则合法空态 404），使用带标记的兜底文案
    }
    const notFound = new Error(message || '资源不存在（404）');
    (notFound as Error & { httpStatus?: number }).httpStatus = 404;
    throw notFound;
  }
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string' && parsed.message) message = parsed.message;
    } catch {
      // 非 JSON 响应体（如网关纯文本错误），保持原文展示
    }
    const error = new Error(message || '请求失败') as Error & { httpStatus?: number };
    error.httpStatus = response.status;
    throw error;
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  // assignRole 等接口返回 200 空 body，与 204 等价对待
  return (text ? JSON.parse(text) : undefined) as T;
}

export const LOGIN_BASE_URL = import.meta.env.VITE_LOGIN_BASE_URL || '';

const defaultNavigator = (url: string) => window.location.assign(url);

let portalNavigator = defaultNavigator;

export function configurePortalNavigator(navigator = defaultNavigator) {
  portalNavigator = navigator;
}

export function navigateTo(url: string) {
  portalNavigator(url);
}

export function redirectToLogin() {
  navigateTo(`${LOGIN_BASE_URL}/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
}

export function redirectToChangePassword() {
  navigateTo(`${LOGIN_BASE_URL}/change-password?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
}
