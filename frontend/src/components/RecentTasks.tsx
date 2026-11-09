
import { useState } from 'react'
import { ChevronDown, ChevronUp, Eye, Pencil, Trash2 } from 'lucide-react'
import type { Task, TaskStatus } from '../types/task'
import './RecentTasks.css'

type RecentTasksProps = {
  tasks: Task[]
  saving: boolean
  onView: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onStatusChange: (task: Task, status: TaskStatus) => Promise<void>
}

const DEFAULT_VISIBLE_TASKS = 5

export default function RecentTasks({
  tasks,
  saving,
  onView,
  onEdit,
  onDelete,
  onStatusChange
}: RecentTasksProps) {
  const [expanded, setExpanded] = useState(false)

  const hasMoreTasks = tasks.length > DEFAULT_VISIBLE_TASKS

  const visibleTasks = expanded
    ? tasks
    : tasks.slice(0, DEFAULT_VISIBLE_TASKS)

  if (tasks.length === 0) {
    return (
      <div className="recent-empty">
        No tasks yet. Create your first task to get started.
      </div>
    )
  }

  return (
    <div className="recent-tasks-container">
      <div className="recent-tasks-summary">
        <span>
          Showing {visibleTasks.length} of {tasks.length} tasks
        </span>

        {hasMoreTasks && (
          <button
            type="button"
            className="recent-toggle-button"
            onClick={() => setExpanded(current => !current)}
            aria-expanded={expanded}
            aria-controls="recent-task-list"
          >
            {expanded ? (
              <>
                <ChevronUp size={15} />
                Show less
              </>
            ) : (
              <>
                <ChevronDown size={15} />
                View all
              </>
            )}
          </button>
        )}
      </div>

      <div
        id="recent-task-list"
        className={`recent-list ${
          expanded ? 'recent-list-expanded' : ''
        }`}
      >
        {visibleTasks.map(task => (
          <article className="recent-task" key={task.id}>
            <div className="recent-task-main">
              <button
                type="button"
                className="recent-task-title"
                onClick={() => onView(task)}
                title={task.title}
              >
                {task.title}
              </button>

              <div className="recent-task-meta">
                <span
                  className={`priority priority-${task.priority.toLowerCase()}`}
                >
                  {task.priority}
                </span>

                <span
                  className="recent-task-owner"
                  title={`Owner: ${task.owner}`}
                >
                  {task.owner}
                </span>
              </div>
            </div>

            <div className="recent-task-controls">
              <select
                className={`op-status-select status-${task.status
                  .toLowerCase()
                  .replace(/\s+/g, '-')}`}
                value={task.status}
                disabled={saving}
                aria-label={`Status for ${task.title}`}
                onChange={event => {
                  void onStatusChange(
                    task,
                    event.target.value as TaskStatus
                  )
                }}
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>

              <div className="recent-task-actions">
                <button
                  type="button"
                  className="op-icon-button"
                  title="View task"
                  aria-label={`View ${task.title}`}
                  onClick={() => onView(task)}
                >
                  <Eye size={16} />
                </button>

                <button
                  type="button"
                  className="op-icon-button"
                  title="Edit task"
                  aria-label={`Edit ${task.title}`}
                  disabled={saving}
                  onClick={() => onEdit(task)}
                >
                  <Pencil size={16} />
                </button>

                <button
                  type="button"
                  className="op-icon-button op-delete-action"
                  title="Delete task"
                  aria-label={`Delete ${task.title}`}
                  disabled={saving}
                  onClick={() => onDelete(task)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
