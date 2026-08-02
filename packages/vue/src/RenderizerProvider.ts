import { defineComponent, watchEffect } from 'vue'
import type { PropType } from 'vue'
import { setRenderizerConfig, type RenderizerConfig } from './config'

export default defineComponent({
  name: 'RenderizerProvider',
  props: {
    config: { type: Object as PropType<RenderizerConfig>, required: true },
  },
  setup(props, { slots }) {
    watchEffect(() => {
      setRenderizerConfig(props.config)
    })

    return () => slots.default?.()
  },
})
