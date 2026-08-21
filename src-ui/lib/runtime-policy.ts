export type RuntimePreset="observe"|"local"|"connected";

export function runtimePresetError(runtime:string,preset:RuntimePreset):string|undefined{
  if(runtime==="auto")return undefined;
  if(runtime==="claude-code"&&preset==="local")return "Claude Code requires observe or connected policy";
  if(runtime==="codex"&&preset!=="local")return "Codex requires local workspace policy";
  if(runtime==="opencode"&&preset!=="connected")return "OpenCode requires connected workspace policy";
  if((runtime==="ollama"||runtime.startsWith("ollama:"))&&preset!=="observe")return "Ollama model-only execution requires observe policy";
  return undefined;
}
