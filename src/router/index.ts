import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { navigation } from '../app/navigation';

/** 开放完整七关流程。 */
export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/supplier', name: 'supplier', component: () => import('../views/SupplierView.vue') },
    { path: '/mail', name: 'mail', component: () => import('../views/MailView.vue') },
    { path: '/chat', name: 'chat', component: () => import('../views/ChatView.vue') },
    { path: '/contract', name: 'contract', component: () => import('../views/ContractView.vue') },
    {
      path: '/documents',
      name: 'documents',
      component: () => import('../views/DocumentsView.vue'),
    },
    {
      path: '/logistics',
      name: 'logistics',
      component: () => import('../views/LogisticsView.vue'),
    },
    { path: '/quote', name: 'quote', component: () => import('../views/QuoteView.vue') },
    { path: '/ending', name: 'ending', component: () => import('../views/EndingView.vue') },
    { path: '/glossary', name: 'glossary', component: () => import('../views/GlossaryView.vue') },
    { path: '/recovery', name: 'recovery', component: () => import('../views/RecoveryView.vue') },
    { path: '/playtest', name: 'playtest', component: () => import('../views/PlaytestView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
router.beforeEach(() => {
  navigation.loading = true;
  navigation.failed = false;
});
router.afterEach(() => {
  navigation.loading = false;
});
router.onError(() => {
  navigation.loading = false;
  navigation.failed = true;
});
