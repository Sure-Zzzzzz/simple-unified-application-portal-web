<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next';
import { computed } from 'vue';
import type { PortalAccessibleMenuTreeNode } from '../api/portalAuth';
import { menuNodeIcon } from '../trustedApplicationIcons';

defineOptions({ name: 'PortalMenuTree' });

const props = withDefaults(defineProps<{
  applicationCode: string;
  nodes: PortalAccessibleMenuTreeNode[];
  activeMenuCode: string;
  expandedNodeKeys: string[];
  level?: number;
}>(), { level: 0 });

const emit = defineEmits<{
  navigate: [route: string];
  toggleGroup: [key: string];
}>();

const sortedNodes = computed(() => [...props.nodes].sort((left, right) => left.sortOrder - right.sortOrder));

function nodeKey(node: PortalAccessibleMenuTreeNode) {
  return `${props.applicationCode}:${node.code}`;
}

function isExpanded(node: PortalAccessibleMenuTreeNode) {
  return props.expandedNodeKeys.includes(nodeKey(node));
}

function hasChildren(node: PortalAccessibleMenuTreeNode) {
  return node.nodeType === 'GROUP' && node.children.length > 0;
}

function activateNode(node: PortalAccessibleMenuTreeNode) {
  if (node.nodeType === 'GROUP') {
    emit('toggleGroup', nodeKey(node));
    return;
  }
  if (node.route) {
    emit('navigate', node.route);
  }
}
</script>

<template>
  <div class="portal-menu-tree" :class="`portal-menu-tree--level-${level}`">
    <template v-for="node in sortedNodes" :key="node.code">
      <button
        class="app-subnav-item"
        :class="{ 'app-subnav-group': node.nodeType === 'GROUP', active: node.nodeType === 'PAGE' && activeMenuCode === node.code }"
        :style="{ '--portal-menu-depth': level }"
        type="button"
        :aria-expanded="hasChildren(node) ? isExpanded(node) : undefined"
        @click="activateNode(node)"
      >
        <component :is="menuNodeIcon(node.icon, node.nodeType).component" :size="15" :stroke-width="2" aria-hidden="true" />
        <span>{{ node.name }}</span>
        <ChevronDown v-if="hasChildren(node)" class="app-subnav-chevron" :class="{ collapsed: !isExpanded(node) }" :size="15" :stroke-width="2" aria-hidden="true" />
      </button>
      <PortalMenuTree
        v-if="hasChildren(node) && isExpanded(node)"
        :application-code="applicationCode"
        :nodes="node.children"
        :active-menu-code="activeMenuCode"
        :expanded-node-keys="expandedNodeKeys"
        :level="level + 1"
        @navigate="emit('navigate', $event)"
        @toggle-group="emit('toggleGroup', $event)"
      />
    </template>
  </div>
</template>
