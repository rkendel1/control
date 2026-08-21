"use client";

import React, { useEffect, useState } from "react";
import { invoke } from "@/lib/tauri";
import "./TasksPanel.css";

type TaskItem = {
  id: string;
  title: string;
  project_id: string;
  status: string;
  created_at: string;
};

interface TasksPanelProps {
  projectId?: string;
}

export default function TasksPanel({ projectId }: TasksPanelProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = async () => {
    if (!projectId) {
      setTasks([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await invoke<any>("cmd_tasks_list", { projectId });
      if (response.success && response.data) {
        setTasks(response.data as TaskItem[]);
      } else {
        setError(response.error || "Failed to load tasks");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, [projectId]);

  const createTask = async () => {
    if (!projectId || !newTitle.trim()) return;

    setError(null);
    try {
      const response = await invoke<any>("cmd_task_create", {
        title: newTitle.trim(),
        projectId,
        description: null,
      });
      if (!response.success) {
        setError(response.error || "Failed to create task");
        return;
      }
      setNewTitle("");
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    }
  };

  const startTask = async (taskId: string) => {
    setError(null);
    try {
      const response = await invoke<any>("cmd_task_start", { taskId });
      if (!response.success) {
        setError(response.error || "Failed to start task");
        return;
      }
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start task");
    }
  };

  return (
    <div className="tasks-panel">
      <div className="tasks-header">
        <input
          className="tasks-input"
          placeholder="New task title..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void createTask();
            }
          }}
        />
        <button className="tasks-add" onClick={() => void createTask()}>
          Add
        </button>
      </div>

      {error && <div className="tasks-error">{error}</div>}

      <div className="tasks-list">
        {isLoading ? (
          <div className="tasks-empty">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="tasks-empty">No tasks yet</div>
        ) : (
          tasks.map((task) => (
            <div className="task-item" key={task.id}>
              <div className="task-title">{task.title}</div>
              <div className="task-meta">{task.status}</div>
              <button
                className="task-start"
                onClick={() => void startTask(task.id)}
                disabled={task.status === "in-progress"}
              >
                {task.status === "in-progress" ? "Running" : "Start"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
