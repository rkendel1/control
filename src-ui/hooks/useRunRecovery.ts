import { useEffect } from "react";
import { invoke } from "../lib/tauri";
import { createId, getControlDatabase, LOCAL_PARTICIPANT_ID, type ControlRun } from "../lib/control-db";
import { recoveryAction } from "../lib/task-lifecycle";

export function useRunRecovery(): void {
  useEffect(() => {
    let disposed = false;
    const db = getControlDatabase();
    const startupRuns = db.runs.all().then(runs => new Set(runs.filter(run => ["starting", "running"].includes(run.status)).map(run => run.id)));

    const interrupt = async (run: ControlRun, reason: string) => {
      if (disposed || !["starting", "running"].includes((await db.runs.get(run.id))?.status || "")) return;
      const now = Date.now();
      await db.runs.update(run.id, { status: "interrupted", completedAt: now, error: reason });
      if(run.kind==="conversation"){
        if(run.requestMessageId)await db.messages.update(run.requestMessageId,{deliveryStatus:"failed",error:reason,runId:run.id});
        await db.works.update(run.workId,{status:"active",updatedAt:now});
      }else if(run.taskId){await db.transitionRuntimeWork(run.taskId,"requeued",{updatedAt:now});}
      const eventId = createId("run_event");
      await db.runEvents.insert({ id: eventId, runId: run.id, projectId: run.projectId, workId: run.workId, taskId: run.taskId, type: "interrupted", content: reason, createdAt: now }, eventId);
      const activityId = createId("activity");
      await db.activity.insert({ id: activityId, projectId: run.projectId, workId: run.workId, taskId: run.taskId, runId: run.id, type: "run_interrupted", actor: "system", summary: "Recovered an interrupted agent run", details: reason, createdAt: now }, activityId);
      const inboxId = createId("inbox");
      await db.inboxItems.insert({ id: inboxId, projectId: run.projectId, workId: run.workId, taskId: run.taskId, fromParticipantId: run.agentId, toParticipantId: LOCAL_PARTICIPANT_ID, type: "escalation", title: "Agent run interrupted during recovery", body: reason, status: "open", createdAt: now, updatedAt: now }, inboxId);
    };

    const audit = async () => {
      const initial = await startupRuns;
      const runs = (await db.runs.all()).filter(run => ["starting", "running"].includes(run.status));
      for (const run of runs) {
        if (disposed) return;
        if (!run.pid) {
          if (recoveryAction(run, undefined, initial.has(run.id), Date.now()) === "interrupt") await interrupt(run, "Agent launch did not establish a process within 30 seconds.");
          continue;
        }
        const running = await invoke<boolean>("cmd_process_is_running", { pid: run.pid, expectedProcessStartedAt: run.processStartedAt });
        if (!running.success) {
          await interrupt(run, `Control could not verify the agent process during recovery: ${running.error || "unknown error"}`);
          continue;
        }
        const action = recoveryAction(run, running.data, initial.has(run.id), Date.now());
        if (action === "terminate-orphan") {
          const stopped = await invoke<boolean>("cmd_agent_run_stop", { pid: run.pid, expectedProcessStartedAt: run.processStartedAt });
          await interrupt(run, stopped.success
            ? "Control terminated an orphaned agent process left by the previous application session. The task is ready to resume safely."
            : `Control found an orphaned agent process but could not terminate it: ${stopped.error || "unknown error"}`);
          continue;
        }
        if (action === "interrupt") await interrupt(run, running.data
          ? "A legacy agent process survived restart but lacks safe process identity; Control did not risk terminating a potentially reused PID."
          : "Agent process ended while Control was not observing it.");
      }
    };

    void audit();
    const timer = window.setInterval(() => void audit(), 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  },[]);
}
