
import { useEffect, useState } from 'react'

import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  ListTodo,
  Workflow,
  Zap,
  PlayCircle,
  Activity,
  Loader2
} from 'lucide-react'

import RecentTasks from './RecentTasks'
import { apiRequest } from '../services/api'
import type { Task, TaskStatus } from '../types/task'

type WorkflowSummary = {
  is_active: boolean
  trigger_type: string
  action_type: string
}

type OverviewDashboardProps = {
  tasks: Task[]
  saving: boolean
  onViewTask: (task: Task) => void
  onEditTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onStatusChange: (
    task: Task,
    status: TaskStatus
  ) => Promise<void>
  onViewTasks: (status?: TaskStatus) => void
  onOpenAssistant: () => void
}

export default function OverviewDashboard({
  tasks,
  saving,
  onViewTask,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onViewTasks,
  onOpenAssistant
}: OverviewDashboardProps) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [workflowLoading, setWorkflowLoading] = useState(true)
  const [workflowError, setWorkflowError] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadWorkflows() {
      try {
        const data = await apiRequest<WorkflowSummary[]>('/api/workflows')

        if (mounted) {
          setWorkflows(data)
          setWorkflowError(false)
        }
      } catch {
        if (mounted) {
          setWorkflowError(true)
        }
      } finally {
        if (mounted) {
          setWorkflowLoading(false)
        }
      }
    }

    void loadWorkflows()

    return () => {
      mounted = false
    }
  }, [])

  const pending = tasks.filter(
    task => task.status === 'Pending'
  ).length

  const inProgress = tasks.filter(
    task => task.status === 'In Progress'
  ).length

  const completed = tasks.filter(
    task => task.status === 'Completed'
  ).length

  const activeWorkflows = workflows.filter(
    workflow => workflow.is_active
  ).length

  const manualWorkflows = workflows.filter(
    workflow =>
      workflow.is_active &&
      workflow.trigger_type === 'manual'
  ).length

  const taskActionWorkflows = workflows.filter(
    workflow => workflow.action_type === 'create_task'
  ).length

  const stats: {
    label: string
    value: number | string
    icon: typeof ListTodo
    detail: string
    status?: TaskStatus
  }[] = [
    {
      label: 'Total Tasks',
      value: tasks.length,
      icon: ListTodo,
      detail: 'Across your workspace'
    },
    {
      label: 'Pending Tasks',
      value: pending,
      icon: Clock3,
      detail: 'Waiting to be started',
      status: 'Pending'
    },
    {
      label: 'In Progress Tasks',
      value: inProgress,
      icon: Activity,
      detail: 'Currently being worked on',
      status: 'In Progress'
    },
    {
      label: 'Completed Tasks',
      value: completed,
      icon: CheckCircle2,
      detail: 'Successfully finished',
      status: 'Completed'
    }
  ]

  return (
    <>
      <div className="stats-grid">
        {stats.map(stat => {
          const Icon = stat.icon

          return (
            <button
              type="button"
              className="stat-card stat-card-button"
              key={stat.label}
              onClick={() => onViewTasks(stat.status)}
              aria-label={`View ${stat.label.toLowerCase()}`}
            >
              <div className="stat-top">
                <span>{stat.label}</span>
                <Icon size={19} />
              </div>

              <div className="stat-value">
                {stat.value}
              </div>

              <div className="stat-detail">
                {stat.detail}
              </div>
            </button>
          )
        })}
      </div>

      <div className="dashboard-grid">
        <section className="panel" style={{ minWidth: 0 }}>
          <div className="panel-heading">
            <div>
              <h2>Recent tasks</h2>
              <p>Keep track of your team's priorities.</p>
            </div>

            <button
              type="button"
              className="text-button"
              onClick={() => onViewTasks()}
            >
              View all
              <ArrowUpRight size={16} />
            </button>
          </div>

          <RecentTasks
            tasks={tasks.slice(0, 4)}
            saving={saving}
            onView={onViewTask}
            onEdit={onEditTask}
            onDelete={onDeleteTask}
            onStatusChange={onStatusChange}
          />
        </section>

        <section className="panel assistant-panel">
          <div className="assistant-icon">
            <Bot size={24} />
          </div>

          <div className="assistant-tag">
            <span className="status-dot" />
            AI ASSISTANT AVAILABLE
          </div>

          <h2>Meet your AI copilot</h2>

          <p>
            Analyze your workspace tasks,
            identify potential bottlenecks,
            and receive AI-powered recommendations.
          </p>

          <div className="assistant-example">
            "Which tasks should I prioritize first?"
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={onOpenAssistant}
          >
            Open AI Assistant
            <ArrowUpRight size={16} />
          </button>
        </section>
      </div>

      <section className="panel bottom-panel">
        <div className="panel-heading">
          <div>
            <h2>Automation overview</h2>
            <p>
              A snapshot of your configured workflow automations.
            </p>
          </div>

          <span className="neutral-tag">
            {workflowLoading
              ? 'Loading'
              : workflowError
                ? 'Unavailable'
                : 'Workflow engine active'}
          </span>
        </div>

        {workflowLoading ? (
          <div className="empty-state">
            <Loader2 size={23} />
            <strong>Loading automation data</strong>
            <p>
              Retrieving your configured workflows.
            </p>
          </div>
        ) : workflowError ? (
          <div className="empty-state">
            <Workflow size={23} />
            <strong>Unable to load workflow data</strong>
            <p>
              Check your backend connection and try refreshing the dashboard.
            </p>
          </div>
        ) : workflows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Workflow size={23} />
            </div>

            <strong>No workflows configured yet</strong>

            <p>
              Create your first workflow to start automating
              task creation and activity logging.
            </p>
          </div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-top">
                  <span>Total workflows</span>
                  <Workflow size={19} />
                </div>

                <div className="stat-value">
                  {workflows.length}
                </div>

                <div className="stat-detail">
                  Configured automations
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Active workflows</span>
                  <Zap size={19} />
                </div>

                <div className="stat-value">
                  {activeWorkflows}
                </div>

                <div className="stat-detail">
                  Enabled workflows
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Manual execution</span>
                  <PlayCircle size={19} />
                </div>

                <div className="stat-value">
                  {manualWorkflows}
                </div>

                <div className="stat-detail">
                  Active manual triggers
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Task actions</span>
                  <Activity size={19} />
                </div>

                <div className="stat-value">
                  {taskActionWorkflows}
                </div>

                <div className="stat-detail">
                  Workflows configured to create tasks
                </div>
              </div>
            </div>

            <div className="empty-state">
              <strong>Manual workflow execution is available</strong>

              <p>
                Active manual workflows can be executed from
                Workflow Management. Event-driven triggers,
                including task-created and approval events,
                are not implemented yet.
              </p>
            </div>
          </>
        )}
      </section>
    </>
  )
}
