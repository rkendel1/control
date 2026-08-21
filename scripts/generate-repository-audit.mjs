import {execFileSync} from "node:child_process";
import {readFileSync,statSync,writeFileSync,existsSync} from "node:fs";
import {extname,dirname,join,normalize,basename} from "node:path";

const root=new URL("..",import.meta.url).pathname.replace(/\/$/,"");
const trackedSet=new Set(execFileSync("git",["ls-files"],{cwd:root,encoding:"utf8"}).trim().split("\n").filter(Boolean));
const lines=execFileSync("git",["ls-files","--cached","--others","--exclude-standard"],{cwd:root,encoding:"utf8"}).trim().split("\n").filter(Boolean).sort();
const sourceExtensions=new Set([".ts",".tsx",".js",".jsx",".mjs",".css"]),uiFiles=new Set(lines.filter(path=>path.startsWith("src-ui/"))),reachable=new Set(),references=new Map(lines.map(path=>[path,[]]));

function resolveImport(from,specifier){
  if(!specifier.startsWith(".")&&!specifier.startsWith("@/"))return;
  const base=specifier.startsWith("@/")?`src-ui/${specifier.slice(2)}`:normalize(join(dirname(from),specifier));
  for(const candidate of [base,...[".ts",".tsx",".js",".jsx",".mjs",".css"].map(ext=>base+ext),... [".ts",".tsx",".js",".jsx"].map(ext=>join(base,"index"+ext))])if(uiFiles.has(candidate))return candidate;
}
function walkUi(path){
  if(reachable.has(path)||!uiFiles.has(path))return;reachable.add(path);
  if(!sourceExtensions.has(extname(path)))return;
  const content=readFileSync(join(root,path),"utf8"),pattern=/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(["']([^"']+)["']\)/g;
  for(const match of content.matchAll(pattern)){const target=resolveImport(path,match[1]||match[2]);if(target){references.get(target)?.push(path);walkUi(target);}}
}
walkUi("src-ui/main.tsx");

const extensionLanguage={".ts":"TypeScript",".tsx":"TypeScript/React",".js":"JavaScript",".jsx":"JavaScript/React",".mjs":"JavaScript module",".rs":"Rust",".json":"JSON",".md":"Markdown",".css":"CSS",".toml":"TOML",".yml":"YAML",".yaml":"YAML",".sh":"Shell",".bat":"Batch",".png":"PNG",".svg":"SVG",".gif":"GIF",".ico":"Icon",".icns":"Icon",".lock":"Lockfile"};
function classify(path){
  if(path.startsWith("mission-control/"))return ["LEGACY","DELETE","Superseded Next.js Mission Control application; absent from the desktop build graph"];
  if(new Set(["src-tauri/src/agent.rs","src-tauri/src/coordination.rs","src-tauri/src/graph.rs","src-tauri/src/memory.rs","src-tauri/src/project.rs","src-tauri/src/runtime.rs","src-tauri/src/task.rs","src-tauri/src/workspace.rs"]).has(path))return ["LEGACY","DELETE","Superseded native domain/state implementation or unused graph IPC service"];
  if(new Set(["src-tauri/src/lib.rs","src-tauri/src/commands.rs"]).has(path))return ["CORE","KEEP","Canonical native desktop service boundary"];
  if(path==="src-ui/vite.config.ts")return ["BUILD","KEEP","Vite production build configuration"];
  if(path.startsWith("src-ui/")&&sourceExtensions.has(extname(path))&&!reachable.has(path)&&!path.includes(".test.")&&!path.includes("/__tests__/")&&!path.startsWith("src-ui/scripts/"))return ["LEGACY","DELETE","Not reachable from the production Vite entrypoint"];
  if(path.includes("/__tests__/")||path.includes(".test."))return ["TEST",path.startsWith("mission-control/")?"DELETE":"KEEP","Automated behavior verification"];
  if(path.startsWith("docs/")||path.endsWith(".md"))return ["DOCUMENTATION","KEEP","Product, architecture, operation, or audit documentation"];
  if(path.startsWith("src-tauri/gen/")||path.startsWith("src-tauri/icons/"))return ["GENERATED","KEEP","Tauri-generated schema or packaged platform asset"];
  if(path.startsWith("src-ui/")||path.startsWith("src-tauri/"))return ["CORE","KEEP","Production desktop implementation or build input"];
  if(path.startsWith("scripts/")||path.startsWith("commands/")||path.startsWith("skills/")||path.startsWith(".claude/"))return ["TOOLING","KEEP","Developer or agent workflow tooling"];
  if(path.startsWith(".github/"))return ["BUILD","KEEP","Repository automation or contribution workflow"];
  if(/(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|Cargo\.(toml|lock)|tsconfig.*\.json|vite\.config\.ts|tauri\.conf\.json|build\.rs)$/.test(path))return ["BUILD","KEEP","Build, dependency, or package configuration"];
  return ["CONFIGURATION","KEEP","Repository-level configuration or metadata"];
}
function domain(path){if(path.startsWith("mission-control/"))return "legacy-web";if(path.startsWith("src-ui/components/"))return "desktop-ui";if(path.startsWith("src-ui/lib/"))return "desktop-domain";if(path.startsWith("src-tauri/"))return "native";if(path.startsWith("docs/")||path.endsWith(".md"))return "documentation";if(path.startsWith("scripts/")||path.startsWith("commands/")||path.startsWith("skills/"))return "tooling";return "repository";}
const nativeRuntime=new Set(["src-tauri/src/main.rs","src-tauri/src/commands.rs","src-tauri/src/lib.rs","src-tauri/src/error.rs","src-tauri/src/file.rs","src-tauri/src/git.rs","src-tauri/src/search.rs","src-tauri/src/terminal.rs","src-tauri/src/watcher.rs"]);
const files=lines.map(path=>{const [classification,disposition,purpose]=classify(path),extension=extname(path),runtimeReachable=reachable.has(path)||nativeRuntime.has(path);return {path,fileType:extension||basename(path),size:statSync(join(root,path)).size,language:extensionLanguage[extension]||"Other",package:path.startsWith("mission-control/")?"mission-control":path.startsWith("src-ui/")?"control-workbench":path.startsWith("src-tauri/")?"control-native":"root",ownerDomain:domain(path),productionOrNonproduction:runtimeReachable||["src-tauri/build.rs","src-tauri/tauri.conf.json","src-ui/vite.config.ts"].includes(path)?"production":"nonproduction",generated:classification==="GENERATED",tracked:trackedSet.has(path),referencedBy:references.get(path)||[],entryPoint:["src-ui/main.tsx","src-tauri/src/main.rs"].includes(path),runtimeReachable,canonical:classification!=="LEGACY",classification,purpose,disposition};});
const counts={files:files.length,tracked:files.filter(file=>file.tracked).length,audited:files.length,unclassified:files.filter(file=>!file.classification).length,unknownPurpose:files.filter(file=>!file.purpose).length,runtimeReachable:files.filter(file=>file.runtimeReachable).length,legacy:files.filter(file=>file.classification==="LEGACY").length,delete:files.filter(file=>file.disposition==="DELETE").length};
writeFileSync(join(root,"control-repository-audit.json"),JSON.stringify({generatedAt:new Date().toISOString(),scope:"All tracked and non-ignored repository files",counts,authority:{work:"FeltDB",tasks:"FeltDB",conversations:"FeltDB",runEvents:"FeltDB",source:"filesystem",history:"Git",secrets:"OS keychain",processes:"native supervisor / OS",ephemeralUi:"React"},files},null,2)+"\n");
console.log(JSON.stringify(counts,null,2));
