export type RuntimeWorkTransition="started"|"failed"|"review"|"awaiting-input"|"requeued"|"resumed"|"handoff";
export type RuntimeTaskStatus="not-started"|"in-progress"|"awaiting-input"|"review"|"failed";
export type RuntimeWorkStatus="active"|"awaiting-input"|"review"|"failed"|"reopened";

const transitions:Record<RuntimeWorkTransition,{taskStatus:RuntimeTaskStatus;workStatus:RuntimeWorkStatus}>={
  started:{taskStatus:"in-progress",workStatus:"active"},
  failed:{taskStatus:"failed",workStatus:"failed"},
  review:{taskStatus:"review",workStatus:"review"},
  "awaiting-input":{taskStatus:"awaiting-input",workStatus:"awaiting-input"},
  requeued:{taskStatus:"not-started",workStatus:"reopened"},
  resumed:{taskStatus:"not-started",workStatus:"active"},
  handoff:{taskStatus:"not-started",workStatus:"active"},
};

export function runtimeWorkTransition(transition:RuntimeWorkTransition){return transitions[transition];}
