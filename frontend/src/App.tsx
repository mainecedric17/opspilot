
import { useState } from 'react'
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  ListTodo,
  Loader2,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  X,
  Zap
} from 'lucide-react'

import ActivityLogs from './ActivityLogs'
import TaskTable from './components/TaskTable'
import TaskFormModal from './components/TaskFormModal'
import OverviewDashboard from './components/OverviewDashboard'
import DeleteTaskModal from './components/DeleteTaskModal'
import TaskDetailsModal from './components/TaskDetailsModal'
import './App.css'

type Page =
  | 'Overview'
  | 'Tasks'
  | 'AI Assistant'
  | 'Approvals'
  | 'Workflows'
  | 'Activity Logs'

import type {
  Task,
  TaskForm,
} from './types/task'
import { emptyForm } from './types/task'
import { useTasks } from './hooks/useTasks'
const navigation = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Tasks', icon: ListTodo },
  { name: 'AI Assistant', icon: Bot },
  { name: 'Approvals', icon: ShieldCheck },
  { name: 'Workflows', icon: Workflow },
  { name: 'Activity Logs', icon: Activity }
] as const

function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [ownerFilter, setOwnerFilter] = useState('All')

  const {
    tasks,
    loading,
    saving,
    error,
    notice,
    setError,
    setNotice,
    createTask,
    updateTask,
    changeStatus,
    deleteTask: removeTask
  } = useTasks()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskForm>(emptyForm)

  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [detailsId, setDetailsId] = useState<string | null>(null)

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

    const wasEditing = editingTask !== null

    const success = editingTask
      ? await updateTask(editingTask.id, form)
      : await createTask(form)

    if (!success) return

    if (!wasEditing) {
      clearFilters()
    }

    setModalOpen(false)
    setEditingTask(null)
    setPage('Tasks')
  }

  async function confirmDeleteTask() {
    if (!deleteTarget || saving) return

    const success = await removeTask(deleteTarget.id)

    if (!success) return

    setDetailsId(null)
    setDeleteTarget(null)
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
            <OverviewDashboard
              tasks={tasks}
              saving={saving}
              onViewTask={task => setDetailsId(task.id)}
              onEditTask={openEdit}
              onDeleteTask={setDeleteTarget}
              onStatusChange={changeStatus}
              onViewAllTasks={() => setPage('Tasks')}
              onOpenAssistant={() => setPage('AI Assistant')}
            />
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
        <TaskDetailsModal
          task={selectedTask}
          onClose={() => setDetailsId(null)}
          onEdit={openEdit}
        />
      )}
      {modalOpen && (
        <TaskFormModal
          editingTask={editingTask}
          form={form}
          saving={saving}
          error={error}
          onChange={setForm}
          onClose={() => {
            if (saving) return
            setModalOpen(false)
            setError('')
          }}
          onSubmit={saveTask}
          onClearError={() => setError('')}
        />
      )}
      {deleteTarget && (
        <DeleteTaskModal
          task={deleteTarget}
          saving={saving}
          onClose={() => {
            if (!saving) {
              setDeleteTarget(null)
            }
          }}
          onConfirm={() => {
            void confirmDeleteTask()
          }}
        />
      )}
    </div>
  )
}

export default App




