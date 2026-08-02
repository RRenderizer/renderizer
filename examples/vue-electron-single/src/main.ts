import { createApp } from 'vue'
import { createRenderizer } from '@renderizer/vue'
import App from './App.vue'
import renderizerConfig from '../renderizer.config'
import './styles.css'

createApp(App)
  .use(createRenderizer(renderizerConfig))
  .mount('#app')
