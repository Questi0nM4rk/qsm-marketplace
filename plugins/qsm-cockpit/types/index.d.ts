export type Stage = 'LOAD' | 'PLAN' | 'EXECUTE' | 'VERIFY' | 'LEARN' | 'CLOSE'

/** One step of the loop the main agent entered, and what put it there. */
export type StageStep = { stage: Stage; why: string; at: number }

/** How an agent's run stands: running until its turn completes, then why it ended. */
export type Outcome = 'running' | 'answer' | 'aborted' | 'refusal' | 'error'

export type AgentRun = {
  id: string
  tier: string
  model: string
  description: string
  kind: string
  startedAt: number
  /** Milliseconds it ran; null while it runs. */
  tookMs: number | null
  outcome: Outcome
  /** The stage it said with the stage tool, when it said one. */
  stage?: Stage
  /** What it does now: its last tool call, said short (`Bash sleep 30`). */
  doing: string
}

/** One answered question, under the typed ask it was asked for. */
export type Decision = { ask: string; question: string; answer: string; at: number }

export type Task = { id: string; title: string }

declare module 'claude-code' {
  interface PluginState {
    'qsm-cockpit': {
      steps: StageStep[]
      runs: AgentRun[]
      answers: Decision[]
      /** The person's last typed prompt: the ask the next decisions answer to. */
      currentAsk: string
      /** The asks whose decisions the pane shows open. */
      openAsks: string[]
      tasks: Task[]
      closed: string[]
      /** Whether the main chat's turn runs now. */
      isMainWorking: boolean
      /** Whether the pane lists the agents that finished. */
      isShowingDone: boolean
    }
  }
}
