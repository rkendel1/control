export type ModelTier="local"|"frontier";
export type ModelPreference="auto"|ModelTier;
export type RoutingAssessment={tier:ModelTier;score:number;reason:string;signals:string[]};

const architecture=/\b(architecture|architectural|system design|design system|distributed|cross[- ]service|platform|protocol|data model|schema design)\b/i;
const highRisk=/\b(security|authentication|authorization|permissions?|cryptograph|secrets?|credentials?|payment|billing|production|deployment|migration|data loss|destructive|concurren|race condition|deadlock)\b/i;
const broadScope=/\b(rewrite|redesign|replatform|replace|across (the )?(app|system|repository)|end[- ]to[- ]end|multi[- ]repo|breaking change|major refactor)\b/i;
const deepReasoning=/\b(root cause|intermittent|nondeterministic|performance|memory leak|complex debugging|trade[- ]offs?|unknown cause)\b/i;

export function assessModelRouting(input:{title:string;description?:string;acceptanceCriteria?:string[];tags?:string[];priority?:string;failedRuns?:number;preference?:ModelPreference}):RoutingAssessment{
  if(input.preference&&input.preference!=="auto")return{tier:input.preference,score:0,signals:["manual override"],reason:`${input.preference==="local"?"Local":"Frontier"} — explicitly selected`};
  const text=[input.title,input.description||"",...(input.acceptanceCriteria||[]),...(input.tags||[])].join(" ");
  let score=0;const signals:string[]=[];
  const add=(points:number,label:string)=>{score+=points;signals.push(label);};
  if(architecture.test(text))add(4,"architectural impact");
  if(highRisk.test(text))add(4,"high-risk domain");
  if(broadScope.test(text))add(3,"broad change scope");
  if(deepReasoning.test(text))add(2,"deep diagnosis or trade-offs");
  if(input.priority==="critical")add(2,"critical priority");
  else if(input.priority==="high")add(1,"high priority");
  if((input.acceptanceCriteria?.length||0)>=6)add(1,"large acceptance surface");
  if((input.failedRuns||0)>=2)add(4,"repeated local failures");
  const tier:ModelTier=score>=4?"frontier":"local";
  return{tier,score,signals,reason:tier==="frontier"?`Frontier — ${signals.join(", ")||"complex reasoning"}`:`Local — ${signals.length?signals.join(", "):"routine implementation"}`};
}
