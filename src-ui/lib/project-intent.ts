export type CreateProjectIntent={location:"desktop"|"documents";name:string};
export function parseCreateProjectIntent(input:string):CreateProjectIntent|undefined{
  const match=input.match(/\b(?:create|make|start|set up|build)\b[\s\S]{0,40}?\bproject\b[\s\S]{0,40}?\b(?:at|in|on)\s+(?:my\s+)?(desktop|documents)\b[\s\S]{0,30}?\b(?:called|named)\s+["']?([a-z0-9][a-z0-9._-]*)["']?/i);
  return match?{location:match[1].toLowerCase() as CreateProjectIntent["location"],name:match[2]}:undefined;
}
