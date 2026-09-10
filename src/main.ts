import { createApp } from 'vue';
import '@sure-zzzzzz/simple-iam-theme-contract/theme.css';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import MicroAppView from './view/MicroAppView.vue';
import MessageCenterView from './view/MessageCenterView.vue';
import './style.css';

const router = createRouter({
  history: createWebHistory('/app/'),
  routes: [
    { path: '/', component: MicroAppView },
    { path: '/inbox', component: MessageCenterView },
    { path: '/:pathMatch(.*)*', component: MicroAppView }
  ]
});

createApp(App).use(router).mount('#app');
