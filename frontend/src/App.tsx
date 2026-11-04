
import { useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  LayoutDashboard,
  ListTodo,
  Loader2,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Workflow,
  X,
  Zap
} from 'lucide-react'

import ActivityLogs from './ActivityLogs'
import TaskTable from './components/TaskTable'
import './App.css'

type Page =
  | 'Overview'
  | 'Tasks'
  | 'AI Assistant'
  | 'Approvals'
  | 'Workflows'
  | 'Activity Logs'

type Priority = 'Low' | 'Medium' | 'High'

type TaskStatus =
  | 'Pending'
  | 'In Progress'
  | 'Completed'

type Task = {
  id: string
  title: string
  description: string | null
  owner: string
  priority: Priority
  status: TaskStatus
  created_at: string
  updated_at: string
}

type TaskForm = {
  title: string
  description: string
  owner: string
  priority: Priority
  status: TaskStatus
}

const API_URL = 'http://127.0.0.1:8000'

const emptyForm: TaskForm = {
  title: '',
  description: '',
  owner: 'Operations',
  priority: 'Medium',
  status: 'Pending'
}

const navigation = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Tasks', icon: ListTodo },
  { name: 'AI Assistant', icon: Bot },
  { name: 'Approvals', icon: ShieldCheck },
  { name: 'Workflows', icon: Workflow },
  { name: 'Activity Logs', icon: Activity }
] as const

async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return date.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila'
  })
}

function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [tasks, setTasks] = useState<Task[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [ownerFilter, setOwnerFilter] = useState('All')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskForm>(emptyForm)

  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [detailsId, setDetailsId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadTasks() {
      try {
        const data = await apiRequest<Task[]>('/api/tasks')

        if (!cancelled) {
          setTasks(data)
          setError('')
        }
      } catch {
        if (!cancelled) {
          setError(
            'Cannot connect to FastAPI. Check that the backend is running.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadTasks()

    return () => {
      cancelled = true
    }
  }, [])

  const pending = tasks.filter(
    task => task.status === 'Pending'
  ).length

  const completed = tasks.filter(
    task => task.status === 'Completed'
  ).length

  const owners = Array.from(
    new Set(tasks.map(task => task.owner))
  ).sort()

  const filteredTasks = tasks.filter(task => {
    const matchesSearch =
      `${task.title} ${task.description ?? ''} ${task.owner} ${task.status} ${task.priority}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())

    const matchesStatus =
      statusFilter === 'All' ||
      task.status === statusFilter

    const matchesPriority =
      priorityFilter === 'All' ||
      task.priority === priorityFilter

    const matchesOwner =
      ownerFilter === 'All' ||
      task.owner === ownerFilter

    return (
      matchesSearch &&
      matchesStatus &&
      matchesPriority &&
      matchesOwner
    )
  })

  const hasFilters =
    search !== '' ||
    statusFilter !== 'All' ||
    priorityFilter !== 'All' ||
    ownerFilter !== 'All'

  const selectedTask =
    tasks.find(task => task.id === detailsId) ?? null

  function clearFilters() {
    setSearch('')
    setStatusFilter('All')
    setPriorityFilter('All')
    setOwnerFilter('All')
  }

  function openCreate() {
    setEditingTask(null)
    setForm({ ...emptyForm })
    setError('')
    setModalOpen(true)
  }

  function openEdit(task: Task) {
    setEditingTask(task)

    setForm({
      title: task.title,
      description: task.description ?? '',
      owner: task.owner,
      priority: task.priority,
      status: task.status
    })

    setDetailsId(null)
    setError('')
    setModalOpen(true)
  }

  async function saveTask() {
    if (saving) return

    if (!form.title.trim() || !form.owner.trim()) {
      setError('Task title and owner are required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      if (editingTask) {
        const updated = await apiRequest<Task>(
          `/api/tasks/${editingTask.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              title: form.title.trim(),
              description: form.description.trim() || null,
              owner: form.owner.trim(),
              priority: form.priority,
              status: form.status
            })
          }
        )

        setTasks(current =>
          current.map(task =>
            task.id === updated.id ? updated : task
          )
        )

        setNotice('Task updated successfully.')
      } else {
        const created = await apiRequest<Task>(
          '/api/tasks',
          {
            method: 'POST',
            body: JSON.stringify({
              title: form.title.trim(),
              description: form.description.trim() || null,
              owner: form.owner.trim(),
              priority: form.priority
            })
          }
        )

        setTasks(current => [created, ...current])
        clearFilters()
        setNotice('Task created successfully.')
      }

      setModalOpen(false)
      setEditingTask(null)
      setPage('Tasks')
    } catch {
      setError(
        'Could not save task. Please check the backend.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(
    task: Task,
    status: TaskStatus
  ) {
    if (saving || task.status === status) return

    setSaving(true)
    setError('')

    try {
      const updated = await apiRequest<Task>(
        `/api/tasks/${task.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status })
        }
      )

      setTasks(current =>
        current.map(item =>
          item.id === updated.id ? updated : item
        )
      )

      setNotice('Task status updated.')
    } catch {
      setError('Could not update task status.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTask() {
    if (!deleteTarget || saving) return

    setSaving(true)
    setError('')

    try {
      await apiRequest<void>(
        `/api/tasks/${deleteTarget.id}`,
        { method: 'DELETE' }
      )

      setTasks(current =>
        current.filter(task =>
          task.id !== deleteTarget.id
        )
      )

      setDetailsId(null)
      setDeleteTarget(null)
      setNotice('Task deleted successfully.')
    } catch {
      setError('Could not delete task.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`sidebar ${
          sidebarOpen ? 'sidebar-open' : ''
        }`}
      >
        <div className="brand">
          <div className="brand-icon">
            <Zap size={21} fill="currentColor" />
          </div>

          <div>
            <strong>OpsPilot</strong>
            <span>AI Operations Platform</span>
          </div>

          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={19} />
          </button>
        </div>

        <div className="workspace">
          <div className="workspace-avatar">O</div>

          <div>
            <strong>Demo Workspace</strong>
            <span>Personal workspace</span>
          </div>

          <ChevronDown size={16} />
        </div>

        <div className="nav-label">
          WORKSPACE
        </div>

        <nav className="navigation">
          {navigation.map(item => {
            const Icon = item.icon

            return (
              <button
                key={item.name}
                className={`nav-item ${
                  page === item.name ? 'active' : ''
                }`}
                onClick={() => {
                  setPage(item.name)
                  setSidebarOpen(false)
                }}
              >
                <Icon size={19} />
                <span>{item.name}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="nav-label">
            PREFERENCES
          </div>

          <button
            className="nav-item"
            onClick={() =>
              alert('Settings coming soon.')
            }
          >
            <Settings size={19} />
            Settings
          </button>

          <button
            className="nav-item"
            onClick={() =>
              alert('Documentation coming soon.')
            }
          >
            <CircleHelp size={19} />
            Help & Support
          </button>

          <div className="user-profile">
            <div className="user-avatar">
              MT
            </div>

            <div>
              <strong>Workspace Admin</strong>
              <span>Demo account</span>
            </div>

            <ChevronDown size={16} />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={21} />
            </button>

            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{page}</strong>
          </div>

          <div className="topbar-right">
            <span className="system-status">
              <span className="status-dot" />
              Development mode
            </span>

            <div className="top-avatar">
              MT
            </div>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <Sparkles size={15} />
                YOUR OPERATIONS, SIMPLIFIED
              </div>

              <h1>
                {page === 'Overview'
                  ? 'Good day, welcome back'
                  : page}
                <span className="heading-dot">
                  .
                </span>
              </h1>

              <p>
                {page === 'Overview'
                  ? "Here's what's happening across your workspace today."
                  : page === 'Activity Logs'
                    ? 'Track changes and actions across your workspace.'
                    : `Manage your ${page.toLowerCase()} from one place.`}
              </p>
            </div>

            <button
              className="primary-button"
              onClick={openCreate}
              disabled={saving}
            >
              <Plus size={17} />
              New Task
            </button>
          </div>

          {error && (
            <div
              className="op-alert op-alert-error"
              role="alert"
            >
              <AlertCircle size={18} />
              <span>{error}</span>

              <button
                onClick={() => setError('')}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {notice && (
            <div
              className="op-alert op-alert-success"
              role="status"
            >
              <CheckCircle2 size={18} />
              <span>{notice}</span>

              <button
                onClick={() => setNotice('')}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {loading ? (
            <section className="panel">
              <div className="empty-state">
                <Loader2
                  className="op-spin"
                  size={28}
                />
                <strong>
                  Loading workspace tasks...
                </strong>
              </div>
            </section>
          ) : page === 'Overview' ? (
            <>
              <div className="stats-grid">
                {[
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
                ].map(stat => {
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
                      onClick={() => setPage('Tasks')}
                    >
                      View all
                      <ArrowUpRight size={16} />
                    </button>
                  </div>

                  <TaskTable
                    tasks={tasks.slice(0, 4)}
                    saving={saving}
                    onView={task =>
                      setDetailsId(task.id)
                    }
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    onStatusChange={changeStatus}
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
                    onClick={() =>
                      setPage('AI Assistant')
                    }
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
          ) : page === 'Tasks' ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>All tasks</h2>
                  <p>
                    Showing {filteredTasks.length} of{' '}
                    {tasks.length} tasks
                  </p>
                </div>

                <div className="search-box">
                  <Search size={17} />

                  <input
                    placeholder="Search tasks..."
                    value={search}
                    onChange={e =>
                      setSearch(e.target.value)
                    }
                    aria-label="Search tasks"
                  />
                </div>
              </div>

              <div className="op-filter-bar">
                <div className="op-filter-label">
                  <SlidersHorizontal size={16} />
                  Filters
                </div>

                <select
                  className="op-filter-select"
                  value={statusFilter}
                  onChange={e =>
                    setStatusFilter(e.target.value)
                  }
                  aria-label="Filter by status"
                >
                  <option value="All">
                    All statuses
                  </option>
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

                <select
                  className="op-filter-select"
                  value={priorityFilter}
                  onChange={e =>
                    setPriorityFilter(e.target.value)
                  }
                  aria-label="Filter by priority"
                >
                  <option value="All">
                    All priorities
                  </option>
                  <option value="Low">
                    Low
                  </option>
                  <option value="Medium">
                    Medium
                  </option>
                  <option value="High">
                    High
                  </option>
                </select>

                <select
                  className="op-filter-select"
                  value={ownerFilter}
                  onChange={e =>
                    setOwnerFilter(e.target.value)
                  }
                  aria-label="Filter by owner"
                >
                  <option value="All">
                    All owners
                  </option>

                  {owners.map(owner => (
                    <option
                      key={owner}
                      value={owner}
                    >
                      {owner}
                    </option>
                  ))}
                </select>

                {hasFilters && (
                  <button
                    className="op-clear-filters"
                    onClick={clearFilters}
                  >
                    <X size={14} />
                    Clear filters
                  </button>
                )}
              </div>

              <TaskTable
                tasks={filteredTasks}
                saving={saving}
                onView={task =>
                  setDetailsId(task.id)
                }
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onStatusChange={changeStatus}
                hasFilters={hasFilters}
                onClearFilters={clearFilters}
              />
            </section>
          ) : page === 'Activity Logs' ? (
            <ActivityLogs />
          ) : (
            <section className="panel feature-placeholder">
              <div className="empty-icon">
                <Sparkles size={28} />
              </div>

              <h2>{page}</h2>

              <p>
                This module is planned for the next
                development phase. No live automation
                is connected yet.
              </p>

              <span className="neutral-tag">
                Under development
              </span>
            </section>
          )}
        </div>
      </main>

      {selectedTask && (
        <div
          className="op-modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              setDetailsId(null)
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
                  {selectedTask.title}
                </h2>

                <p>
                  View task information and manage progress.
                </p>
              </div>

              <button
                className="op-icon-button"
                onClick={() =>
                  setDetailsId(null)
                }
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
                {selectedTask.description?.trim() ||
                  'No description provided for this task.'}
              </p>
            </div>

            <div className="op-details-grid">
              <div className="op-details-field">
                <span className="op-details-label">
                  Priority
                </span>

                <span
                  className={`priority priority-${selectedTask.priority.toLowerCase()}`}
                >
                  {selectedTask.priority}
                </span>
              </div>

              <div className="op-details-field">
                <span className="op-details-label">
                  Status
                </span>

                <span
                  className={`task-status status-${selectedTask.status.toLowerCase().replace(' ', '-')}`}
                >
                  <span className="mini-dot" />
                  {selectedTask.status}
                </span>
              </div>

              <div className="op-details-field">
                <span className="op-details-label">
                  Owner
                </span>

                <strong>
                  {selectedTask.owner}
                </strong>
              </div>

              <div className="op-details-field">
                <span className="op-details-label">
                  Task ID
                </span>

                <code className="op-task-id">
                  {selectedTask.id.slice(0, 8)}...
                </code>
              </div>
            </div>

            <div className="op-details-dates">
              <div>
                <CalendarDays size={16} />

                <span>
                  Created:{' '}
                  {formatDate(selectedTask.created_at)}
                </span>
              </div>

              <div>
                <Clock3 size={16} />

                <span>
                  Updated:{' '}
                  {formatDate(selectedTask.updated_at)}
                </span>
              </div>
            </div>

            <div className="op-modal-actions">
              <button
                className="op-cancel-button"
                onClick={() =>
                  setDetailsId(null)
                }
              >
                Close
              </button>

              <button
                className="primary-button"
                onClick={() =>
                  openEdit(selectedTask)
                }
              >
                <Pencil size={16} />
                Edit task
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className="op-modal-backdrop"
          onMouseDown={e => {
            if (
              e.target === e.currentTarget &&
              !saving
            ) {
              setModalOpen(false)
              setError('')
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
                className="op-icon-button"
                disabled={saving}
                onClick={() =>
                  setModalOpen(false)
                }
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <form
              className="op-task-form"
              onSubmit={e => {
                e.preventDefault()
                void saveTask()
              }}
            >
              <label>
                Task title

                <input
                  required
                  maxLength={200}
                  placeholder="e.g. Review customer onboarding"
                  value={form.title}
                  onChange={e =>
                    setForm({
                      ...form,
                      title: e.target.value
                    })
                  }
                />
              </label>

              <label>
                Description

                <textarea
                  rows={3}
                  placeholder="Add task details (optional)"
                  value={form.description}
                  onChange={e =>
                    setForm({
                      ...form,
                      description: e.target.value
                    })
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
                    onChange={e =>
                      setForm({
                        ...form,
                        owner: e.target.value
                      })
                    }
                  />
                </label>

                <label>
                  Priority

                  <select
                    value={form.priority}
                    onChange={e =>
                      setForm({
                        ...form,
                        priority:
                          e.target.value as Priority
                      })
                    }
                  >
                    <option value="Low">
                      Low
                    </option>
                    <option value="Medium">
                      Medium
                    </option>
                    <option value="High">
                      High
                    </option>
                  </select>
                </label>
              </div>

              {editingTask && (
                <label>
                  Status

                  <select
                    value={form.status}
                    onChange={e =>
                      setForm({
                        ...form,
                        status:
                          e.target.value as TaskStatus
                      })
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
                  onClick={() =>
                    setModalOpen(false)
                  }
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
      )}

      {deleteTarget && (
        <div className="op-modal-backdrop">
          <div
            className="op-modal op-delete-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
          >
            <div className="op-delete-icon">
              <Trash2 size={24} />
            </div>

            <h2 id="delete-modal-title">
              Delete this task?
            </h2>

            <p>
              You're about to permanently delete
              <strong>
                {' '}{deleteTarget.title}
              </strong>.
              This action cannot be undone.
            </p>

            <div className="op-modal-actions">
              <button
                className="op-cancel-button"
                disabled={saving}
                onClick={() =>
                  setDeleteTarget(null)
                }
              >
                Cancel
              </button>

              <button
                className="op-danger-button"
                disabled={saving}
                onClick={() =>
                  void deleteTask()
                }
              >
                {saving
                  ? 'Deleting...'
                  : 'Delete task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

