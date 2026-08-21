import type {ExplorerNode} from "../types";

export function quickOpenPaths(nodes:ExplorerNode[]):string[]{return nodes.flatMap(node=>node.type==="file"?[node.path]:quickOpenPaths(node.children||[]));}
export function filterQuickOpenPaths(paths:string[],query:string,limit=100):string[]{const terms=query.toLowerCase().split(/\s+/).filter(Boolean);return paths.filter(path=>terms.every(term=>path.toLowerCase().includes(term))).slice(0,limit);}
