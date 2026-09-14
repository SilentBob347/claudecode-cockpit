export interface ChatRequestBody {
  prompt: string;
  sessionId?: string;
  cwd?: string;
  model?: string;
  language?: string;
}

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

export interface AgentContext {
  cwd: string;
  todos: TodoItem[];
  /** Run registry key of this turn; exported to shell commands as COCKPIT_RUN_ID. */
  runId: string;
}
