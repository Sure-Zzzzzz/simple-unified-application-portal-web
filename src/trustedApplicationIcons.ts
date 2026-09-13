import {
  Boxes,
  Calendar,
  Cloud,
  Database,
  FileText,
  FolderTree,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Mail,
  Network,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  TrendingUp,
  Users,
  Workflow
} from 'lucide-vue-next';

const TRUSTED_APPLICATION_ICONS = [
  { code: 'access-control', label: '访问控制', component: ShieldCheck },
  { code: 'users', label: '用户与组织', component: Users },
  { code: 'key', label: '密钥', component: KeyRound },
  { code: 'settings', label: '系统设置', component: Settings },
  { code: 'lock', label: '安全锁定', component: Lock },
  { code: 'dashboard', label: '管理概览', component: LayoutDashboard },
  { code: 'project', label: '项目协作', component: Boxes },
  { code: 'message', label: '消息通知', component: Mail },
  { code: 'calendar', label: '日程', component: Calendar },
  { code: 'workflow', label: '工作流', component: Workflow },
  { code: 'data-service', label: '数据服务', component: Server },
  { code: 'database', label: '数据库', component: Database },
  { code: 'analytics', label: '数据分析', component: TrendingUp },
  { code: 'document', label: '文档', component: FileText },
  { code: 'folder', label: '文件夹', component: FolderTree },
  { code: 'search', label: '检索', component: Search },
  { code: 'cloud', label: '云服务', component: Cloud },
  { code: 'network', label: '网络连接', component: Network },
  { code: 'developer', label: '开发工具', component: Terminal },
  { code: 'application', label: '通用应用', component: LayoutGrid },
  { code: 'default', label: '默认应用', component: LayoutGrid }
] as const;

export function trustedApplicationIcon(value: string | null | undefined) {
  return TRUSTED_APPLICATION_ICONS.find(icon => icon.code === value)
    || TRUSTED_APPLICATION_ICONS.find(icon => icon.code === 'default')!;
}

export function menuNodeIcon(value: string | null | undefined, nodeType: 'GROUP' | 'PAGE') {
  return TRUSTED_APPLICATION_ICONS.find(icon => icon.code === value)
    || TRUSTED_APPLICATION_ICONS.find(icon => icon.code === (nodeType === 'GROUP' ? 'folder' : 'document'))!;
}
