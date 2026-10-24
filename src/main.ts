import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles/main.css';
import './styles/ending.css';
import './styles/onboarding.css';
import './styles/presentation.css';
import './styles/polish.css';
import './styles/trade-polish.css';
import './styles/experience.css';
import './styles/desk.css';

createApp(App).use(createPinia()).use(router).mount('#app');
