/**
 * FORGE Plugins for OpenCode
 *
 * This module exports all FORGE plugins for OpenCode integration.
 * Plugins provide hook-based automation that mirrors Claude Code's hook system
 * while taking advantage of OpenCode's more sophisticated 20+ event types.
 */

export { ForgeHooksPlugin, default } from "./forge-hooks.js"

// Re-export for named imports
export * from "./forge-hooks.js"
