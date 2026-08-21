import type { ControlDatabase, ControlOperationalCommand, ControlProject } from "./control-db";
import { invoke } from "./tauri";
type RepositoryProject=Pick<ControlProject,"id"|"name"|"path">;

const purpose=(name:string):ControlOperationalCommand["purpose"]=>/test|check/.test(name)?"test":/build|compile/.test(name)?"build":/lint|format/.test(name)?"lint":/deploy|release|publish/.test(name)?"deploy":/dev|start|serve/.test(name)?"run":"other";
const fingerprint=(value:string)=>{let hash=2166136261;for(const character of value)hash=Math.imul(hash^character.charCodeAt(0),16777619);return (hash>>>0).toString(16)};

export async function refreshOperationalMemory(db:ControlDatabase,project:RepositoryProject):Promise<void>{
  const now=Date.now(),repositoryId=`repository:${project.id}`,commands:Array<{name:string;command:string;source:string}>=[],docs:Array<{path:string;content:string}>=[];
  const read=async(path:string)=>{const result=await invoke<string>("cmd_file_read",{workspacePath:project.path,filePath:path});return result.success&&typeof result.data==="string"?result.data:undefined};
  const packageJson=await read("package.json");
  if(packageJson)try{const parsed=JSON.parse(packageJson) as {scripts?:Record<string,string>;dependencies?:Record<string,string>;devDependencies?:Record<string,string>};for(const [name] of Object.entries(parsed.scripts||{}))commands.push({name,command:`npm run ${name}`,source:"package.json#scripts"});await upsertRepository(db,project,repositoryId,now,Object.keys({...parsed.dependencies,...parsed.devDependencies}));}catch{/* malformed manifests remain visible in the editor */}
  const cargo=await read("Cargo.toml");if(cargo){commands.push({name:"cargo build",command:"cargo build",source:"Cargo.toml"},{name:"cargo test",command:"cargo test",source:"Cargo.toml"});if(!packageJson)await upsertRepository(db,project,repositoryId,now,[]);}
  if(!packageJson&&!cargo)await upsertRepository(db,project,repositoryId,now,[]);
  for(const item of commands){const id=`command:${project.id}:${item.name}`;const existing=await db.operationalCommands.get(id),record={id,projectId:project.id,repositoryId,name:item.name,purpose:purpose(item.name),command:item.command,source:item.source,createdAt:existing?.createdAt||now,updatedAt:now};if(existing)await db.operationalCommands.update(id,record);else await db.operationalCommands.insert(record,id);}
  for(const path of ["README.md","AGENTS.md","CONTRIBUTING.md"]){const content=await read(path);if(content!==undefined)docs.push({path,content});}
  for(const item of docs){const id=`documentation:${project.id}:${item.path}`,existing=await db.documentation.get(id),nextFingerprint=fingerprint(item.content),status=existing&&existing.fingerprint!==nextFingerprint?"possibly-stale" as const:"current" as const,record={id,projectId:project.id,repositoryId,path:item.path,fingerprint:nextFingerprint,status,checkedAt:now,createdAt:existing?.createdAt||now,updatedAt:now};if(existing)await db.documentation.update(id,record);else await db.documentation.insert(record,id);}
}

async function upsertRepository(db:ControlDatabase,project:RepositoryProject,id:string,now:number,dependencies:string[]){const existing=await db.repositories.get(id),record={id,projectId:project.id,rootPath:project.path,structureSummary:"Project root inspected for manifests and repository guidance",components:[],environments:["local"],deployTargets:[],dependencies,conventions:["AGENTS.md","README.md","CONTRIBUTING.md"],lastScannedAt:now,createdAt:existing?.createdAt||now,updatedAt:now};if(existing)await db.repositories.update(id,record);else await db.repositories.insert(record,id);}
