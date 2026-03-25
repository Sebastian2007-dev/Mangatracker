import { createRouter, createWebHashHistory } from 'vue-router'
import MangaListView from '../views/MangaListView.vue'
import SettingsView from '../views/SettingsView.vue'
import LogView from '../views/LogView.vue'
import ModView from '../views/ModView.vue'
import StatisticsView from '../views/StatisticsView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: MangaListView },
    { path: '/statistics', component: StatisticsView },
    { path: '/settings', component: SettingsView },
    { path: '/log', component: LogView },
    { path: '/tracking', component: () => import('../views/UrlManagementView.vue') },
    { path: '/mod/:modId', component: ModView },
    { path: '/skills', component: () => import('../views/SkillTreeView.vue') },
    { path: '/debug', component: () => import('../views/DebugView.vue') }
  ]
})

export default router
