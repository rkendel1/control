export type EditorNavigationTarget={line:number;column:number;revision?:number};
export type NavigableEditor={setPosition(position:{lineNumber:number;column:number}):void;revealLineInCenter(line:number):void;focus():void};
export function applyEditorTarget(editor:NavigableEditor,target?:EditorNavigationTarget):void{if(!target)return;editor.setPosition({lineNumber:target.line,column:target.column});editor.revealLineInCenter(target.line);editor.focus();}
