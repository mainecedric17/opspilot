
import {
  CalendarDays,
  Clock3,
  Pencil,
  X,
} from 'lucide-react'

import type { Task } from '../types/task'

type TaskDetailsModalProps = {
  task: Task
  onClose: () => void
  onEdit: (task: Task) => void
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return date.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  })
}

export default function TaskDetailsModal({
  task,
  onClose,
  onEdit,
}: TaskDetailsModalProps) {
  return (
    <div
      className="op-modal-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="op-modal op-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
      >
        <div className="op-modal-header">
          <div>
            <span className="op-modal-eyebrow">
              TASK DETAILS
            </span>

            <h2 id="details-title">
              {task.title}
            </h2>

            <p>
              View task information and manage progress.
            </p>
          </div>

          <button
            type="button"
            className="op-icon-button"
            onClick={onClose}
            aria-label="Close task details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="op-details-section">
          <span className="op-details-label">
            Description
          </span>

          <p className="op-details-description">
            {task.description?.trim() ||
              'No description provided for this task.'}
          </p>
        </div>

        <div className="op-details-grid">
          <div className="op-details-field">
            <span className="op-details-label">
              Priority
            </span>

            <span
              className={`priority priority-${task.priority.toLowerCase()}`}
            >
              {task.priority}
            </span>
          </div>

          <div className="op-details-field">
            <span className="op-details-label">
              Status
            </span>

            <span
              className={`task-status status-${task.status
                .toLowerCase()
                .replace(' ', '-')}`}
            >
              <span className="mini-dot" />
              {task.status}
            </span>
          </div>

          <div className="op-details-field">
            <span className="op-details-label">
              Owner
            </span>

            <strong>{task.owner}</strong>
          </div>

          <div className="op-details-field">
            <span className="op-details-label">
              Task ID
            </span>

            <code className="op-task-id">
              {task.id.slice(0, 8)}...
            </code>
          </div>
        </div>

        <div className="op-details-dates">
          <div>
            <CalendarDays size={16} />

            <span>
              Created: {formatDate(task.created_at)}
            </span>
          </div>

          <div>
            <Clock3 size={16} />

            <span>
              Updated: {formatDate(task.updated_at)}
            </span>
          </div>
        </div>

        <div className="op-modal-actions">
          <button
            type="button"
            className="op-cancel-button"
            onClick={onClose}
          >
            Close
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() => onEdit(task)}
          >
            <Pencil size={16} />
            Edit task
          </button>
        </div>
      </div>
    </div>
  )
}
