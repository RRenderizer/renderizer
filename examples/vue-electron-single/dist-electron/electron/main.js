import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RenderWindowManager } from '@renderizer/vue/electron';
import renderizerConfig from '../renderizer.config';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererUrl = process.env.RENDERIZER_EXAMPLE_URL ?? 'http://127.0.0.1:5173';
let mainWindow = null;
let renderWindows = null;
function defaultRenderWindowOptions() {
    const options = {
        backgroundColor: '#10141c',
    };
    const width = renderizerConfig.windows?.default?.width;
    const height = renderizerConfig.windows?.default?.height;
    if (width !== undefined)
        options.width = width;
    if (height !== undefined)
        options.height = height;
    return options;
}
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1120,
        height: 760,
        minWidth: 720,
        minHeight: 480,
        backgroundColor: '#10141c',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    renderWindows = new RenderWindowManager({
        preloadPath: path.join(__dirname, 'preload.js'),
        defaultWindowOptions: defaultRenderWindowOptions(),
        openExternal: (url) => shell.openExternal(url),
    });
    renderWindows.attachTo(mainWindow);
    void mainWindow.loadURL(rendererUrl);
}
ipcMain.handle('renderizer-window-ready', (event, windowId) => {
    renderWindows?.show(event, windowId);
});
ipcMain.handle('renderizer-window-control', (event, windowId, action) => {
    renderWindows?.control(event, windowId, action);
});
ipcMain.handle('renderizer-window-state', (event, windowId) => renderWindows?.getState(event, windowId) ?? { isMaximized: false, isFullScreen: false });
app.whenReady().then(createMainWindow);
app.on('before-quit', () => {
    renderWindows?.closeAll();
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
        createMainWindow();
});
//# sourceMappingURL=main.js.map