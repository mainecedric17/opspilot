
import { Loader2, Trash2 } from 'lucide-react'
import type { Task } from '../types/task'

type DeleteTaskModalProps = {
  task: Task
  saving: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function DeleteTaskModal({
  task,
  saving,
  onClose,
  onConfirm,
}: DeleteTaskModalProps) {
  return (
    <div className="op-modal-backdrop">
      <div
        className="op-modal op-delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-description"
      >
        <div className="op-delete-icon">
          <Trash2 size={24} />
        </div>

        <h2 id="delete-modal-title">
          Delete this task?
        </h2>

        <p id="delete-modal-description">
          You're about to permanently delete{' '}
          <strong>{task.title}</strong>.
          This action cannot be undone.
        </p>

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
            type="button"
            className="op-danger-button"
            disabled={saving}
            onClick={onConfirm}
          >
            {saving && (
              <Loader2
                className="op-spin"
                size={16}
              />
            )}

            {saving ? 'Deleting...' : 'Delete task'}
          </button>
        </div>
      </div>
    </div>
  )
}
