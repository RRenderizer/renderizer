# Renderizer Vue Electron Single Package

This example keeps Vue and Electron in one package.

## Run

Start Vite:

```bash
npm run dev --workspace @renderizer/example-vue-electron-single
```

In another terminal, start Electron:

```bash
npm run dev:electron --workspace @renderizer/example-vue-electron-single
```

Open the inspector window and toggle the theme in the main window. The rendered native window updates with the same Vue runtime and synchronized document styles.
