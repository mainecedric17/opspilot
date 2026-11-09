
import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  History,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Workflow as WorkflowIcon,
  X,
  Zap
} from 'lucide-react'
import { apiRequest } from '../services/api'
import './Workflows.css'

type TriggerType =
  | 'manual'
  | 'task_created'
  | 'approval_approved'
  | 'approval_rejected'

type ActionType = 'log_event' | 'create_task'

type Workflow = {
  id: string
  name: string
  description: string | null
  trigger_type: TriggerType
  action_type: ActionType
  configuration: Record<string, unknown>
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

type WorkflowRun = {
  id: string
  workflow_id: string
  status: string
  trigger_payload: Record<string, unknown>
  result: Record<string, unknown> | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}

type FormState = {
  name: string
  description: string
  trigger_type: TriggerType
  action_type: ActionType
  is_active: boolean
  message: string
  title: string
  taskDescription: string
  owner: string
  priority: 'Low' | 'Medium' | 'High'
}

const emptyForm: FormState = {
  name: '',
  description: '',
  trigger_type: 'manual',
  action_type: 'log_event',
  is_active: false,
  message: 'Manual workflow executed successfully.',
  title: '',
  taskDescription: '',
  owner: 'Operations',
  priority: 'Medium'
}

function getError(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

function formatDate(value: string | null): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString()
}

function formatType(value: string): string {
  return value.replaceAll('_', ' ')
}

function formFromWorkflow(workflow: Workflow): FormState {
  const config = workflow.configuration

  return {
    name: workflow.name,
    description: workflow.description ?? '',
    trigger_type: workflow.trigger_type,
    action_type: workflow.action_type,
    is_active: workflow.is_active,
    message: String(config.message ?? emptyForm.message),
    title: String(config.title ?? ''),
    taskDescription: String(config.description ?? ''),
    owner: String(config.owner ?? 'Operations'),
    priority:
      config.priority === 'Low' ||
      config.priority === 'Medium' ||
      config.priority === 'High'
        ? config.priority
        : 'Medium'
  }
}

function buildConfiguration(form: FormState) {
  if (form.action_type === 'log_event') {
    return {
      message: form.message.trim()
    }
  }

  return {
    title: form.title.trim(),
    description: form.taskDescription.trim() || null,
    owner: form.owner.trim(),
    priority: form.priority
  }
}

export default function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Workflow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const [runTarget, setRunTarget] = useState<Workflow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null)

  const [historyTarget, setHistoryTarget] = useState<Workflow | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Workflow list collapse state
  const [workflowsCollapsed, setWorkflowsCollapsed] = useState(false)

  const loadWorkflows = useCallback(async () => {
    try {
      const data = await apiRequest<Workflow[]>('/api/workflows')
      setWorkflows(data)
      setError('')
    } catch (err) {
      setError(getError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkflows()
  }, [loadWorkflows])

  const activeCount = workflows.filter(item => item.is_active).length
  const manualCount = workflows.filter(
    item => item.trigger_type === 'manual'
  ).length
  const taskCount = workflows.filter(
    item => item.action_type === 'create_task'
  ).length

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setFormOpen(true)
    setError('')
    setNotice('')
  }

  function openEdit(workflow: Workflow) {
    setEditing(workflow)
    setForm(formFromWorkflow(workflow))
    setFormOpen(true)
    setError('')
    setNotice('')
  }

  function updateForm<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm(previous => ({
      ...previous,
      [key]: value
    }))
  }

  async function saveWorkflow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    if (!form.name.trim()) {
      setError('Workflow name is required.')
      return
    }

    if (form.action_type === 'create_task' && !form.title.trim()) {
      setError('Task title is required for create_task workflows.')
      return
    }

    if (form.action_type === 'create_task' && !form.owner.trim()) {
      setError('Task owner is required.')
      return
    }

    if (form.action_type === 'log_event' && !form.message.trim()) {
      setError('Log message is required.')
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      trigger_type: form.trigger_type,
      action_type: form.action_type,
      configuration: buildConfiguration(form),
      is_active: form.is_active
    }

    setBusy(true)
    setError('')

    try {
      if (editing) {
        await apiRequest(`/api/workflows/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        })
      } else {
        await apiRequest('/api/workflows', {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            created_by: 'Workspace Admin'
          })
        })
      }

      setFormOpen(false)
      setEditing(null)
      await loadWorkflows()
      setNotice(
        editing
          ? 'Workflow updated successfully.'
          : 'Workflow created successfully.'
      )
    } catch (err) {
      setError(getError(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(workflow: Workflow) {
    if (busy) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await apiRequest(`/api/workflows/${workflow.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_active: !workflow.is_active
        })
      })

      await loadWorkflows()
      setNotice(
        workflow.is_active
          ? 'Workflow deactivated.'
          : 'Workflow activated.'
      )
    } catch (err) {
      setError(getError(err))
    } finally {
      setBusy(false)
    }
  }

  async function executeWorkflow() {
    if (!runTarget || busy) return

    const target = runTarget
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const result = await apiRequest<WorkflowRun>(
        `/api/workflows/${target.id}/run`,
        {
          method: 'POST',
          body: JSON.stringify({
            confirm: true,
            payload: {
              source: 'opspilot_frontend'
            }
          })
        }
      )

      setRunTarget(null)

      if (result.status === 'Completed') {
        const taskTitle = result.result?.task_title

        setNotice(
          target.action_type === 'create_task'
            ? `Workflow completed. Task created: ${String(taskTitle ?? 'New task')}.`
            : 'Workflow executed successfully.'
        )
      } else {
        setError(`Workflow finished with status: ${result.status}`)
      }
    } catch (err) {
      setError(
        `${getError(err)}. Check execution history before retrying.`
      )
      setRunTarget(null)
    } finally {
      setBusy(false)
    }
  }

  async function openHistory(workflow: Workflow) {
    setHistoryTarget(workflow)
    setHistoryLoading(true)
    setRuns([])
    setError('')

    try {
      const data = await apiRequest<WorkflowRun[]>(
        `/api/workflows/${workflow.id}/runs`
      )
      setRuns(data)
    } catch (err) {
      setError(getError(err))
      setHistoryTarget(null)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteWorkflow() {
    if (!deleteTarget || busy) return

    const target = deleteTarget
    setBusy(true)
    setError('')
    setNotice('')

    try {
      await apiRequest(`/api/workflows/${target.id}`, {
        method: 'DELETE'
      })

      setDeleteTarget(null)
      await loadWorkflows()
      setNotice('Workflow deleted successfully.')
    } catch (err) {
      setError(
        `${getError(err)}. Workflows with execution history cannot be deleted.`
      )
      setDeleteTarget(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wf-page">
      <div className="wf-toolbar">
        <div>
          <h2>Workflow management</h2>
          <p>Create, configure and execute your operations workflows.</p>
        </div>

        <div className="wf-toolbar-actions">
          <button
            className="wf-secondary"
            onClick={() => void loadWorkflows()}
            disabled={busy || loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button className="primary-button" onClick={openCreate}>
            <Plus size={17} />
            New Workflow
          </button>
        </div>
      </div>

      {error && (
        <div className="wf-alert wf-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="wf-alert wf-success" role="status">
          <CheckCircle2 size={17} />
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Dismiss notice">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="wf-stats">
        <div className="wf-stat">
          <WorkflowIcon size={20} />
          <span>Total workflows</span>
          <strong>{workflows.length}</strong>
        </div>

        <div className="wf-stat">
          <Zap size={20} />
          <span>Active workflows</span>
          <strong>{activeCount}</strong>
        </div>

        <div className="wf-stat">
          <Play size={20} />
          <span>Manual triggers</span>
          <strong>{manualCount}</strong>
        </div>

        <div className="wf-stat">
          <Activity size={20} />
          <span>Task actions</span>
          <strong>{taskCount}</strong>
        </div>
      </div>

      {/* WORKFLOW PANEL */}

      <section className="wf-panel">
        <div className="wf-panel-header">
          <div>
            <h3>All workflows</h3>
            <p>Manage your configured automations.</p>
          </div>

          <div className="wf-panel-header-actions">
            <span>{workflows.length} workflows</span>

            <button
              type="button"
              className="wf-collapse-button"
              onClick={() =>
                setWorkflowsCollapsed(previous => !previous)
              }
              aria-expanded={!workflowsCollapsed}
              aria-label={
                workflowsCollapsed
                  ? 'Expand workflows'
                  : 'Collapse workflows'
              }
              title={
                workflowsCollapsed
                  ? 'Expand workflows'
                  : 'Collapse workflows'
              }
            >
              {workflowsCollapsed ? (
                <>
                  <ChevronDown size={16} />
                  <span>Show workflows</span>
                </>
              ) : (
                <>
                  <ChevronUp size={16} />
                  <span>Hide workflows</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div
          className={`wf-collapse-content ${
            workflowsCollapsed ? 'is-collapsed' : ''
          }`}
          aria-hidden={workflowsCollapsed}
          inert={workflowsCollapsed}
        >
          <div className="wf-collapse-inner">
            {loading ? (
              <div className="wf-empty">
                <Loader2 className="op-spin" size={26} />
                <p>Loading workflows...</p>
              </div>
            ) : workflows.length === 0 ? (
              <div className="wf-empty">
                <WorkflowIcon size={32} />
                <h3>No workflows yet</h3>
                <p>Create your first workflow to get started.</p>
                <button className="primary-button" onClick={openCreate}>
                  <Plus size={16} />
                  Create Workflow
                </button>
              </div>
            ) : (
              <div className="wf-list">
                {workflows.map(workflow => (
                  <article className="wf-item" key={workflow.id}>
                    <div className="wf-item-main">
                      <div className="wf-item-icon">
                        <WorkflowIcon size={21} />
                      </div>

                      <div className="wf-item-content">
                        <div className="wf-item-title">
                          <h3>{workflow.name}</h3>
                          <span
                            className={`wf-status ${
                              workflow.is_active
                                ? 'active'
                                : 'inactive'
                            }`}
                          >
                            {workflow.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        <p>
                          {workflow.description ||
                            'No description provided.'}
                        </p>

                        <div className="wf-meta">
                          <span>
                            Trigger: {formatType(workflow.trigger_type)}
                          </span>
                          <span>
                            Action: {formatType(workflow.action_type)}
                          </span>
                          <span>
                            Created: {formatDate(workflow.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="wf-actions">
                      <label className="wf-toggle-label">
                        <input
                          type="checkbox"
                          checked={workflow.is_active}
                          disabled={busy}
                          onChange={() => void toggleActive(workflow)}
                        />
                        Enabled
                      </label>

                      <button
                        className="wf-action-button wf-run"
                        disabled={
                          busy ||
                          !workflow.is_active ||
                          workflow.trigger_type !== 'manual'
                        }
                        onClick={() => setRunTarget(workflow)}
                        title={
                          workflow.trigger_type !== 'manual'
                            ? 'Automatic triggers are not implemented yet'
                            : 'Run workflow'
                        }
                      >
                        <Play size={15} />
                        Run
                      </button>

                      <button
                        className="wf-action-button"
                        onClick={() => void openHistory(workflow)}
                        disabled={busy}
                      >
                        <History size={15} />
                        History
                      </button>

                      <button
                        className="wf-icon-button"
                        title="Edit workflow"
                        aria-label={`Edit ${workflow.name}`}
                        onClick={() => openEdit(workflow)}
                        disabled={busy}
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        className="wf-icon-button wf-delete"
                        title="Delete workflow"
                        aria-label={`Delete ${workflow.name}`}
                        onClick={() => setDeleteTarget(workflow)}
                        disabled={busy}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="wf-info">
        <AlertCircle size={17} />
        <p>
          Only manual workflows can be executed currently. Other trigger
          types are configuration-only until event-driven automation is
          implemented. Every successful create_task execution creates
          a new task.
        </p>
      </div>

      {/* CREATE / EDIT WORKFLOW MODAL */}

      {formOpen && (
        <div className="wf-modal-backdrop">
          <div className="wf-modal" role="dialog" aria-modal="true">
            <div className="wf-modal-header">
              <div>
                <span>WORKFLOW CONFIGURATION</span>
                <h2>{editing ? 'Edit Workflow' : 'Create Workflow'}</h2>
                <p>Configure when and what your workflow will execute.</p>
              </div>
              <button
                className="wf-icon-button"
                onClick={() => setFormOpen(false)}
                disabled={busy}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form className="wf-form" onSubmit={saveWorkflow}>
              <label>
                Workflow name
                <input
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={e => updateForm('name', e.target.value)}
                  placeholder="e.g. Weekly Operations Task"
                />
              </label>

              <label>
                Description
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e =>
                    updateForm('description', e.target.value)
                  }
                  placeholder="What does this workflow do?"
                />
              </label>

              <div className="wf-form-grid">
                <label>
                  Trigger
                  <select
                    value={form.trigger_type}
                    onChange={e =>
                      updateForm(
                        'trigger_type',
                        e.target.value as TriggerType
                      )
                    }
                  >
                    <option value="manual">Manual</option>
                    <option value="task_created">
                      Task created (future)
                    </option>
                    <option value="approval_approved">
                      Approval approved (future)
                    </option>
                    <option value="approval_rejected">
                      Approval rejected (future)
                    </option>
                  </select>
                </label>

                <label>
                  Action
                  <select
                    value={form.action_type}
                    onChange={e =>
                      updateForm(
                        'action_type',
                        e.target.value as ActionType
                      )
                    }
                  >
                    <option value="log_event">Log event</option>
                    <option value="create_task">Create task</option>
                  </select>
                </label>
              </div>

              {form.action_type === 'log_event' ? (
                <label>
                  Log message
                  <textarea
                    required
                    maxLength={2000}
                    rows={3}
                    value={form.message}
                    onChange={e =>
                      updateForm('message', e.target.value)
                    }
                  />
                </label>
              ) : (
                <>
                  <label>
                    Task title
                    <input
                      required
                      maxLength={200}
                      value={form.title}
                      onChange={e =>
                        updateForm('title', e.target.value)
                      }
                      placeholder="Task to create"
                    />
                  </label>

                  <label>
                    Task description
                    <textarea
                      rows={2}
                      value={form.taskDescription}
                      onChange={e =>
                        updateForm('taskDescription', e.target.value)
                      }
                    />
                  </label>

                  <div className="wf-form-grid">
                    <label>
                      Task owner
                      <input
                        required
                        maxLength={150}
                        value={form.owner}
                        onChange={e =>
                          updateForm('owner', e.target.value)
                        }
                      />
                    </label>

                    <label>
                      Priority
                      <select
                        value={form.priority}
                        onChange={e =>
                          updateForm(
                            'priority',
                            e.target.value as FormState['priority']
                          )
                        }
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              <label className="wf-check">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e =>
                    updateForm('is_active', e.target.checked)
                  }
                />
                Activate workflow
              </label>

              <div className="wf-modal-actions">
                <button
                  type="button"
                  className="wf-secondary"
                  disabled={busy}
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy}
                >
                  {busy && (
                    <Loader2 className="op-spin" size={16} />
                  )}
                  {editing ? 'Save Changes' : 'Create Workflow'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RUN WORKFLOW CONFIRMATION */}

      {runTarget && (
        <div className="wf-modal-backdrop">
          <div className="wf-modal wf-confirm" role="dialog" aria-modal="true">
            <div className="wf-modal-header">
              <div>
                <span>CONFIRM EXECUTION</span>
                <h2>Run Workflow?</h2>
                <p>{runTarget.name}</p>
              </div>
              <button
                className="wf-icon-button"
                disabled={busy}
                onClick={() => setRunTarget(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="wf-confirm-detail">
              <strong>
                Action: {formatType(runTarget.action_type)}
              </strong>

              {runTarget.action_type === 'create_task' && (
                <p>
                  This will create a new task titled{' '}
                  <strong>
                    {String(
                      runTarget.configuration.title ?? 'Untitled'
                    )}
                  </strong>
                  . Running again will create another task.
                </p>
              )}

              {runTarget.action_type === 'log_event' && (
                <p>
                  The execution result will be recorded in workflow history.
                </p>
              )}
            </div>

            <div className="wf-modal-actions">
              <button
                className="wf-secondary"
                disabled={busy}
                onClick={() => setRunTarget(null)}
              >
                Cancel
              </button>

              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void executeWorkflow()}
              >
                {busy ? (
                  <Loader2 className="op-spin" size={16} />
                ) : (
                  <Play size={16} />
                )}
                Confirm & Run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE WORKFLOW CONFIRMATION */}

      {deleteTarget && (
        <div className="wf-modal-backdrop">
          <div className="wf-modal wf-confirm" role="dialog" aria-modal="true">
            <div className="wf-modal-header">
              <div>
                <span>DELETE WORKFLOW</span>
                <h2>Delete this workflow?</h2>
                <p>{deleteTarget.name}</p>
              </div>
              <button
                className="wf-icon-button"
                disabled={busy}
                onClick={() => setDeleteTarget(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <p className="wf-warning">
              Workflows with execution history cannot be deleted.
              You can deactivate them instead.
            </p>

            <div className="wf-modal-actions">
              <button
                className="wf-secondary"
                disabled={busy}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>

              <button
                className="wf-danger-button"
                disabled={busy}
                onClick={() => void deleteWorkflow()}
              >
                <Trash2 size={16} />
                Delete Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXECUTION HISTORY */}

      {historyTarget && (
        <div className="wf-modal-backdrop">
          <div
            className="wf-modal wf-history-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="wf-modal-header">
              <div>
                <span>EXECUTION HISTORY</span>
                <h2>{historyTarget.name}</h2>
                <p>Latest 100 recorded executions.</p>
              </div>
              <button
                className="wf-icon-button"
                onClick={() => setHistoryTarget(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {historyLoading ? (
              <div className="wf-empty">
                <Loader2 className="op-spin" size={25} />
                Loading history...
              </div>
            ) : runs.length === 0 ? (
              <div className="wf-empty">
                <Clock3 size={28} />
                <p>No executions recorded yet.</p>
              </div>
            ) : (
              <div className="wf-history-list">
                {runs.map(run => (
                  <div className="wf-history-item" key={run.id}>
                    <div className="wf-history-heading">
                      <span
                        className={`wf-status ${
                          run.status === 'Completed'
                            ? 'active'
                            : run.status === 'Failed'
                              ? 'failed'
                              : 'inactive'
                        }`}
                      >
                        {run.status}
                      </span>

                      <span>{formatDate(run.started_at)}</span>
                    </div>

                    {run.result && (
                      <pre>
                        {JSON.stringify(run.result, null, 2)}
                      </pre>
                    )}

                    {run.error_message && (
                      <p className="wf-warning">
                        {run.error_message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
