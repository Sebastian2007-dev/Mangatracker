import { createRouter, createWebHashHistory } from 'vue-router'
import MangaListView from '../views/MangaListView.vue'
import SettingsView from '../views/SettingsView.vue'
import LogView from '../views/LogView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: MangaListView },
    { path: '/settings', component: SettingsView },
    { path: '/log', component: LogView }
  ]
})

export default router
