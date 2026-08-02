import { defineRenderizerConfig } from '@renderizer/vue';
export default defineRenderizerConfig({
    adapter: 'vue',
    paths: {
        renderer: '.',
        electron: '.',
    },
    windows: {
        default: {
            width: 1180,
            height: 780,
            popup: true,
        },
        presets: [
            {
                id: 'inspector',
                title: 'Renderizer Inspector',
                width: 1200,
                height: 760,
                popup: true,
                minWidth: 720,
                minHeight: 480,
                frame: false,
                backgroundColor: '#10141c',
            },
        ],
    },
});
//# sourceMappingURL=renderizer.config.js.map