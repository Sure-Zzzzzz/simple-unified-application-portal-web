import { describe, expect, it } from 'vitest';
import { createPortalMicroAppProps } from './microApps';
import { loadAccessibleApplications, portalState } from './portalState';

describe('Portal 微应用运行时属性', () => {
  it('应向子应用传递导航重读能力，且不以当前路由作为刷新参数', () => {
    portalState.currentUser = { userId: 1, username: 'admin', displayName: '管理员', admin: true, authorities: [] };

    const props = createPortalMicroAppProps('/app/iam');

    expect(props.refreshPortalNavigation).toBe(loadAccessibleApplications);
    expect(props.routePrefix).toBe('/app/iam');
  });
});
