export function hasExternalFileConflict(baseline:string|undefined,disk:string,editor:string):boolean{
  return baseline!==undefined&&disk!==baseline&&disk!==editor;
}
