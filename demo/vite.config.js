import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    // Copy itk-wasm WASM workers to public dir so they can be loaded at runtime
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@itk-wasm/image-io/dist/pipelines/*.{js,wasm}',
          dest: 'itk/pipelines',
        },
        {
          src: 'node_modules/itk-wasm/dist/web-workers/*.js',
          dest: 'itk',
        },
      ],
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/assets': 'http://localhost:8000',
    },
    // Allow Vite to serve files from outside the demo/ root (viewer/)
    fs: {
      allow: [__dirname, path.resolve(__dirname, '../viewer')],
    },
  },
  resolve: {
    // Force a single copy of VTK.js and itk-wasm — dual instances break VTK singletons
    dedupe: [
      '@kitware/vtk.js',
      '@itk-wasm/image-io',
      'itk-wasm',
      'react',
      'react-dom',
    ],
    alias: {
      '@pulmoscan/viewer': path.resolve(__dirname, '../viewer'),
      // Redirect all @kitware/vtk.js subpath imports to demo/node_modules
      '@kitware/vtk.js': path.resolve(__dirname, 'node_modules/@kitware/vtk.js'),
    },
    modules: [
      path.resolve(__dirname, 'node_modules'),
      'node_modules',
    ],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@kitware/vtk.js/Rendering/Profiles/Geometry',
    ],
    exclude: ['@itk-wasm/image-io', 'itk-wasm'],
  },
})
