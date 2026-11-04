
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  ListTodo,
  Workflow
} from 'lucide-react'

import TaskTable from './TaskTable'
import type { Task, TaskStatus } from '../types/task'

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
  onViewAllTasks: () => void
  onOpenAssistant: () => void
}

export default function OverviewDashboard({
  tasks,
  saving,
  onViewTask,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onViewAllTasks,
  onOpenAssistant
}: OverviewDashboardProps) {
  const pending = tasks.filter(
    task => task.status === 'Pending'
  ).length

  const completed = tasks.filter(
    task => task.status === 'Completed'
  ).length

  const stats = [
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
      detail: 'Waiting to be started'
    },
    {
      label: 'Completed Tasks',
      value: completed,
      icon: CheckCircle2,
      detail: 'Successfully finished'
    },
    {
      label: 'Active Workflows',
      value: '0',
      icon: Workflow,
      detail: 'Not connected yet'
    }
  ]

  return (
    <>
      <div className="stats-grid">
        {stats.map(stat => {
          const Icon = stat.icon

          return (
            <div
              className="stat-card"
              key={stat.label}
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
            </div>
          )
        })}
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent tasks</h2>
              <p>
                Keep track of your team's priorities.
              </p>
            </div>

            <button
              className="text-button"
              onClick={onViewAllTasks}
            >
              View all
              <ArrowUpRight size={16} />
            </button>
          </div>

          <TaskTable
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
            COMING SOON
          </div>

          <h2>Meet your AI copilot</h2>

          <p>
            Analyze requests, organize tasks,
            and prepare follow-ups using
            natural language.
          </p>

          <div className="assistant-example">
            "Prioritize today's customer requests..."
          </div>

          <button
            className="secondary-button"
            onClick={onOpenAssistant}
          >
            Explore AI Assistant
            <ArrowUpRight size={16} />
          </button>
        </section>
      </div>

      <section className="panel bottom-panel">
        <div className="panel-heading">
          <div>
            <h2>Automation overview</h2>
            <p>
              Monitor your connected workflows
              and integrations.
            </p>
          </div>

          <span className="neutral-tag">
            Not configured
          </span>
        </div>

        <div className="empty-state">
          <div className="empty-icon">
            <Workflow size={23} />
          </div>

          <strong>
            No workflows connected yet
          </strong>

          <p>
            Your automation activity will appear
            here after we connect the backend
            and n8n.
          </p>
        </div>
      </section>
    </>
  )
}
