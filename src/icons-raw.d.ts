// `import svg from '~icons/fluent-emoji/<name>?raw'` gives the SVG markup as a string (drawn as a
// canvas sprite by src/arcade/art.ts); the longer prefix wins over unplugin-icons' React typing.
declare module '~icons/fluent-emoji/*?raw' {
  const svg: string
  export default svg
}
