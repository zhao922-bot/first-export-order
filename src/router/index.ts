import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import SupplierView from '../views/SupplierView.vue';
import QuoteView from '../views/QuoteView.vue';
import MailView from '../views/MailView.vue';
import ChatView from '../views/ChatView.vue';
import ContractView from '../views/ContractView.vue';
import DocumentsView from '../views/DocumentsView.vue';
import LogisticsView from '../views/LogisticsView.vue';
import EndingView from '../views/EndingView.vue';
import GlossaryView from '../views/GlossaryView.vue';
import RecoveryView from '../views/RecoveryView.vue';
import PlaytestView from '../views/PlaytestView.vue';

/** 开放完整七关流程。 */
export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/supplier', name: 'supplier', component: SupplierView },
    { path: '/mail', name: 'mail', component: MailView },
    { path: '/chat', name: 'chat', component: ChatView },
    { path: '/contract', name: 'contract', component: ContractView },
    { path: '/documents', name: 'documents', component: DocumentsView },
    { path: '/logistics', name: 'logistics', component: LogisticsView },
    { path: '/quote', name: 'quote', component: QuoteView },
    { path: '/ending', name: 'ending', component: EndingView },
    { path: '/glossary', name: 'glossary', component: GlossaryView },
    { path: '/recovery', name: 'recovery', component: RecoveryView },
    { path: '/playtest', name: 'playtest', component: PlaytestView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
