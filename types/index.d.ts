export type IsOff = boolean

declare module 'claude-code' {
  interface PluginState {
    'clickable-paths': { isOff: IsOff }
  }
}
