
import {
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react'

import type {
  Priority,
  Task,
  TaskForm,
  TaskStatus,
} from '../types/task'

type TaskFormModalProps = {
  editingTask: Task | null
  form: TaskForm
  saving: boolean
  error: string
  onChange: (form: TaskForm) => void
  onClose: () => void
  onSubmit: () => Promise<void>
  onClearError: () => void
}

export default function TaskFormModal({
  editingTask,
  form,
  saving,
  error,
  onChange,
  onClose,
  onSubmit,
  onClearError,
}: TaskFormModalProps) {
  function updateField<K extends keyof TaskForm>(
    field: K,
    value: TaskForm[K]
  ) {
    onChange({
      ...form,
      [field]: value,
    })
  }

  return (
    <div
      className="op-modal-backdrop"
      onMouseDown={event => {
        if (
          event.target === event.currentTarget &&
          !saving
        ) {
          onClose()
        }
      }}
    >
      <div
        className="op-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <div className="op-modal-header">
          <div>
            <span className="op-modal-eyebrow">
              TASK MANAGEMENT
            </span>

            <h2 id="task-modal-title">
              {editingTask
                ? 'Edit task'
                : 'Create new task'}
            </h2>

            <p>
              {editingTask
                ? 'Update the details of this task.'
                : 'Add a task to your workspace.'}
            </p>
          </div>

          <button
            type="button"
            className="op-icon-button"
            disabled={saving}
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <form
          className="op-task-form"
          onSubmit={event => {
            event.preventDefault()
            void onSubmit()
          }}
        >
          {error && (
            <div
              className="op-alert op-alert-error"
              role="alert"
            >
              <AlertCircle size={18} />

              <span>{error}</span>

              <button
                type="button"
                onClick={onClearError}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <label>
            Task title

            <input
              required
              maxLength={200}
              placeholder="e.g. Review customer onboarding"
              value={form.title}
              disabled={saving}
              onChange={event =>
                updateField('title', event.target.value)
              }
            />
          </label>

          <label>
            Description

            <textarea
              rows={3}
              placeholder="Add task details (optional)"
              value={form.description}
              disabled={saving}
              onChange={event =>
                updateField(
                  'description',
                  event.target.value
                )
              }
            />
          </label>

          <div className="op-form-grid">
            <label>
              Owner

              <input
                required
                placeholder="Operations"
                value={form.owner}
                disabled={saving}
                onChange={event =>
                  updateField(
                    'owner',
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Priority

              <select
                value={form.priority}
                disabled={saving}
                onChange={event =>
                  updateField(
                    'priority',
                    event.target.value as Priority
                  )
                }
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </label>
          </div>

          {editingTask && (
            <label>
              Status

              <select
                value={form.status}
                disabled={saving}
                onChange={event =>
                  updateField(
                    'status',
                    event.target.value as TaskStatus
                  )
                }
              >
                <option value="Pending">
                  Pending
                </option>

                <option value="In Progress">
                  In Progress
                </option>

                <option value="Completed">
                  Completed
                </option>
              </select>
            </label>
          )}

          <div className="op-modal-actions">
            <button
              type="button"
              className="op-cancel-button"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving && (
                <Loader2
                  className="op-spin"
                  size={17}
                />
              )}

              {saving
                ? 'Saving...'
                : editingTask
                  ? 'Save changes'
                  : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
