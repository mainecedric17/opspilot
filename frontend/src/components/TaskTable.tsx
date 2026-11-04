
import { Eye, Pencil, Search, Trash2 } from 'lucide-react'
import type { Task, TaskStatus } from '../types/task'

type TaskTableProps = {
  tasks: Task[]
  saving: boolean
  onView: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onStatusChange: (
    task: Task,
    status: TaskStatus
  ) => Promise<void>
  hasFilters?: boolean
  onClearFilters?: () => void
}

export default function TaskTable({
  tasks,
  saving,
  onView,
  onEdit,
  onDelete,
  onStatusChange,
  hasFilters = false,
  onClearFilters
}: TaskTableProps) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>TASK</th>
            <th>PRIORITY</th>
            <th>STATUS</th>
            <th>OWNER</th>
            <th>ACTIONS</th>
          </tr>
        </thead>

        <tbody>
          {tasks.map(task => (
            <tr key={task.id}>
              <td className="task-title">
                <button
                  className="op-task-link"
                  onClick={() => onView(task)}
                  title="View task details"
                >
                  {task.title}
                </button>
              </td>

              <td>
                <span
                  className={`priority priority-${task.priority.toLowerCase()}`}
                >
                  {task.priority}
                </span>
              </td>

              <td>
                <select
                  className={`op-status-select status-${task.status.toLowerCase().replace(' ', '-')}`}
                  value={task.status}
                  disabled={saving}
                  aria-label={`Status for ${task.title}`}
                  onChange={e =>
                    void onStatusChange(
                      task,
                      e.target.value as TaskStatus
                    )
                  }
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </td>

              <td className="owner-cell">
                {task.owner}
              </td>

              <td>
                <div className="op-row-actions">
                  <button
                    className="op-icon-button"
                    title="View task"
                    aria-label={`View ${task.title}`}
                    onClick={() => onView(task)}
                  >
                    <Eye size={17} />
                  </button>

                  <button
                    className="op-icon-button"
                    title="Edit task"
                    aria-label={`Edit ${task.title}`}
                    disabled={saving}
                    onClick={() => onEdit(task)}
                  >
                    <Pencil size={17} />
                  </button>

                  <button
                    className="op-icon-button op-delete-action"
                    title="Delete task"
                    aria-label={`Delete ${task.title}`}
                    disabled={saving}
                    onClick={() => onDelete(task)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {tasks.length === 0 && (
            <tr>
              <td colSpan={5} className="no-results">
                <div className="op-table-empty">
                  <Search size={24} />

                  <strong>No matching tasks</strong>

                  <span>
                    {hasFilters
                      ? 'Try adjusting your filters or search.'
                      : 'Create a task to get started.'}
                  </span>

                  {hasFilters && onClearFilters && (
                    <button
                      className="op-clear-filters"
                      onClick={onClearFilters}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
