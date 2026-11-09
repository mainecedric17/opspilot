
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  LayoutDashboard,
  ListTodo,
  Loader2,
  LogOut,
  Mail,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRoundPen,
  Workflow,
  X,
  Zap
} from 'lucide-react'

import type { User } from '@supabase/supabase-js'
import type { Task, TaskForm, TaskStatus } from './types/task'

import ActivityLogs from './ActivityLogs'
import AIAssistant from './components/AIAssistant'
import Approvals from './components/Approvals'
import Workflows from './components/Workflows'
import TaskTable from './components/TaskTable'
import TaskFormModal from './components/TaskFormModal'
import OverviewDashboard from './components/OverviewDashboard'
import DeleteTaskModal from './components/DeleteTaskModal'
import TaskDetailsModal from './components/TaskDetailsModal'
import { supabase } from './lib/supabaseClient'
import { emptyForm } from './types/task'
import { useTasks } from './hooks/useTasks'

import './App.css'

type Page =
  | 'Overview'
  | 'Tasks'
  | 'AI Assistant'
  | 'Approvals'
  | 'Workflows'
  | 'Activity Logs'

const TASKS_PREVIEW_LIMIT = 5

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
  const [tasksExpanded, setTasksExpanded] = useState(false)

  const [profileOpen, setProfileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [authError, setAuthError] = useState('')
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileNotice, setProfileNotice] = useState('')

  const profileRef = useRef<HTMLDivElement | null>(null)

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

  // --------------------------------------------------
  // AUTHENTICATION
  // --------------------------------------------------

  useEffect(() => {
    let active = true

    async function loadUser() {
      const { data, error: userError } =
        await supabase.auth.getUser()

      if (!active) return

      if (userError) {
        setAuthError(userError.message)
        return
      }

      setCurrentUser(data.user)
    }

    void loadUser()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return

      setCurrentUser(session?.user ?? null)

      if (!session) {
        setProfileOpen(false)
        setEditingProfile(false)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // --------------------------------------------------
  // ACCOUNT MENU INTERACTIONS
  // --------------------------------------------------

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false)

        if (!profileSaving) {
          setEditingProfile(false)
          setProfileError('')
        }
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [profileSaving])

  const userEmail = currentUser?.email ?? 'Signed-in user'

  const storedFullName =
    typeof currentUser?.user_metadata?.full_name === 'string'
      ? currentUser.user_metadata.full_name.trim()
      : ''

  const userName =
    storedFullName ||
    userEmail.split('@')[0] ||
    'Workspace User'

  const userInitials =
    userName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('') || 'U'

  // --------------------------------------------------
  // PROFILE MANAGEMENT
  // --------------------------------------------------

  function openProfileEditor() {
    setProfileName(storedFullName)
    setProfileError('')
    setProfileNotice('')
    setProfileOpen(false)
    setEditingProfile(true)
  }

  function closeProfileEditor() {
    if (profileSaving) return

    setEditingProfile(false)
    setProfileError('')
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (profileSaving) return

    const normalizedName = profileName.trim().replace(/\s+/g, ' ')

    if (normalizedName.length < 2) {
      setProfileError('Please enter a name with at least 2 characters.')
      return
    }

    if (normalizedName.length > 100) {
      setProfileError('Full name must be 100 characters or fewer.')
      return
    }

    setProfileSaving(true)
    setProfileError('')
    setProfileNotice('')

    try {
      const { data, error: updateError } =
        await supabase.auth.updateUser({
          data: { full_name: normalizedName }
        })

      if (updateError) throw updateError

      if (!data.user) {
        throw new Error('Profile update did not return a user.')
      }

      setCurrentUser(data.user)
      setProfileName(normalizedName)
      setEditingProfile(false)
      setProfileNotice('Profile updated successfully.')
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : 'Unable to update your profile. Please try again.'
      )
    } finally {
      setProfileSaving(false)
    }
  }

  // --------------------------------------------------
  // TASK FILTERING
  // --------------------------------------------------

  const owners = Array.from(
    new Set(tasks.map(task => task.owner))
  ).sort()

  const filteredTasks = tasks.filter(task => {
    const matchesSearch =
      `${task.title} ${task.description ?? ''} ${task.owner} ${task.status} ${task.priority}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())

    const matchesStatus =
      statusFilter === 'All' || task.status === statusFilter

    const matchesPriority =
      priorityFilter === 'All' || task.priority === priorityFilter

    const matchesOwner =
      ownerFilter === 'All' || task.owner === ownerFilter

    return (
      matchesSearch &&
      matchesStatus &&
      matchesPriority &&
      matchesOwner
    )
  })

  const hasFilters =
    search.trim() !== '' ||
    statusFilter !== 'All' ||
    priorityFilter !== 'All' ||
    ownerFilter !== 'All'

  const visibleTasks =
    tasksExpanded || hasFilters
      ? filteredTasks
      : filteredTasks.slice(0, TASKS_PREVIEW_LIMIT)

  const canToggleTasks =
    !hasFilters && filteredTasks.length > TASKS_PREVIEW_LIMIT

  const selectedTask =
    tasks.find(task => task.id === detailsId) ?? null

  function clearFilters() {
    setSearch('')
    setStatusFilter('All')
    setPriorityFilter('All')
    setOwnerFilter('All')
  }

  // --------------------------------------------------
  // NAVIGATION
  // --------------------------------------------------

  function navigateTo(nextPage: Page) {
    setPage(nextPage)
    setSidebarOpen(false)
    setProfileOpen(false)

    if (nextPage !== 'Tasks') {
      setTasksExpanded(false)
    }
  }

  function viewTasksFromDashboard(status?: TaskStatus) {
    setSearch('')
    setPriorityFilter('All')
    setOwnerFilter('All')
    setStatusFilter(status ?? 'All')
    setTasksExpanded(true)

    navigateTo('Tasks')
  }

  // --------------------------------------------------
  // TASK ACTIONS
  // --------------------------------------------------

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

    if (!wasEditing) clearFilters()

    setModalOpen(false)
    setEditingTask(null)
    setTasksExpanded(false)
    setPage('Tasks')
  }

  async function confirmDeleteTask() {
    if (!deleteTarget || saving) return

    const success = await removeTask(deleteTarget.id)

    if (!success) return

    setDetailsId(null)
    setDeleteTarget(null)
  }

  // --------------------------------------------------
  // SIGN OUT
  // --------------------------------------------------

  async function handleSignOut() {
    if (signingOut) return

    setSigningOut(true)
    setAuthError('')

    try {
      const { error: signOutError } =
        await supabase.auth.signOut()

      if (signOutError) throw signOutError

      setProfileOpen(false)
    } catch (signOutError) {
      setAuthError(
        signOutError instanceof Error
          ? signOutError.message
          : 'Unable to sign out. Please try again.'
      )
    } finally {
      setSigningOut(false)
    }
  }

  const showNewTaskAction =
    page === 'Overview' || page === 'Tasks'

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          type="button"
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation menu"
        />
      )}

      <aside
        className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}
        aria-label="Main sidebar"
      >
        {/* BRAND */}
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">
            <Zap size={21} fill="currentColor" />
          </div>

          <div className="brand-copy">
            <strong>OpsPilot</strong>
            <span>AI Operations Platform</span>
          </div>

          <button
            type="button"
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={19} />
          </button>
        </div>

        {/* WORKSPACE SWITCHER */}
        <button
          type="button"
          className="workspace"
          aria-label="Current workspace: Demo Workspace"
          title="Current workspace"
        >
          <div className="workspace-avatar" aria-hidden="true">
            O
          </div>

          <div className="workspace-copy">
            <strong>Demo Workspace</strong>
            <span>Personal workspace</span>
          </div>

          <ChevronDown size={16} aria-hidden="true" />
        </button>

        {/* SIDEBAR NAVIGATION */}
        <div className="sidebar-navigation">
          <div className="sidebar-nav-group">
            <div className="nav-label">WORKSPACE</div>

            <nav
              className="navigation"
              aria-label="Workspace navigation"
            >
              {navigation.map(item => {
                const Icon = item.icon
                const isActive = page === item.name

                return (
                  <button
                    key={item.name}
                    type="button"
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => navigateTo(item.name)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span>{item.name}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="sidebar-nav-group sidebar-preferences">
            <div className="nav-label">PREFERENCES</div>

            <nav
              className="navigation"
              aria-label="Preferences navigation"
            >
              <button
                type="button"
                className="nav-item"
                onClick={() => window.alert('Settings coming soon.')}
              >
                <Settings size={19} aria-hidden="true" />
                <span>Settings</span>
                <span className="nav-coming-soon">Soon</span>
              </button>

              <button
                type="button"
                className="nav-item"
                onClick={() => window.alert('Documentation coming soon.')}
              >
                <CircleHelp size={19} aria-hidden="true" />
                <span>Help & Support</span>
                <span className="nav-coming-soon">Soon</span>
              </button>
            </nav>
          </div>

          <div className="sidebar-spacer" />

          {/* ACCOUNT SECTION */}
          <div className="account-area" ref={profileRef}>
            {profileOpen && (
              <div
                className="account-menu"
                role="menu"
                aria-label="Account menu"
              >
                <div className="account-menu-heading">
                  <span className="account-menu-label">SIGNED IN AS</span>
                  <strong>{userName}</strong>

                  <div className="account-email">
                    <Mail size={15} aria-hidden="true" />
                    <span>{userEmail}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="account-menu-item"
                  role="menuitem"
                  onClick={openProfileEditor}
                >
                  <UserRoundPen size={17} />
                  Edit Profile
                </button>

                <button
                  type="button"
                  className="account-menu-item account-menu-danger"
                  role="menuitem"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                >
                  {signingOut ? (
                    <Loader2 size={17} className="op-spin" />
                  ) : (
                    <LogOut size={17} />
                  )}

                  {signingOut ? 'Signing out...' : 'Sign out'}
                </button>
              </div>
            )}

            <button
              type="button"
              className="user-profile"
              onClick={() => setProfileOpen(value => !value)}
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              aria-label="Open account menu"
            >
              <div className="user-avatar" aria-hidden="true">
                {userInitials}
              </div>

              <div className="user-profile-copy">
                <strong title={userName}>{userName}</strong>
                <span title={userEmail}>{userEmail}</span>
              </div>

              {profileOpen ? (
                <ChevronUp size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              aria-expanded={sidebarOpen}
            >
              <Menu size={21} />
            </button>

            <span className="breadcrumb-root">Workspace</span>
            <span className="slash" aria-hidden="true">/</span>
            <strong>{page}</strong>
          </div>

          <div className="topbar-right">
            <span className="system-status">
              <span className="status-dot" />
              Development mode
            </span>

            <div className="top-avatar" aria-label={`Signed in as ${userName}`}>
              {userInitials}
            </div>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div className="page-heading-copy">
              <div className="eyebrow">
                <Sparkles size={15} aria-hidden="true" />
                YOUR OPERATIONS, SIMPLIFIED
              </div>

              <h1>
                {page === 'Overview'
                  ? 'Good day, welcome back'
                  : page}
                <span className="heading-dot">.</span>
              </h1>

              <p>
                {page === 'Overview'
                  ? "Here's what's happening across your workspace today."
                  : page === 'Activity Logs'
                    ? 'Track changes and actions across your workspace.'
                    : page === 'AI Assistant'
                      ? 'Get AI-powered insights into your workspace tasks and priorities.'
                      : page === 'Approvals'
                        ? 'Review requests and track decisions across your workspace.'
                        : page === 'Workflows'
                          ? 'Build, manage, and execute your operations workflows.'
                          : 'Manage and organize your work from one place.'}
              </p>
            </div>

            {showNewTaskAction && (
              <button
                type="button"
                className="primary-button"
                onClick={openCreate}
                disabled={saving}
              >
                <Plus size={17} />
                New Task
              </button>
            )}
          </div>

          {authError && (
            <div className="op-alert op-alert-error" role="alert">
              <AlertCircle size={18} />
              <span>{authError}</span>
              <button
                type="button"
                onClick={() => setAuthError('')}
                aria-label="Dismiss authentication error"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {profileNotice && (
            <div className="op-alert op-alert-success" role="status">
              <CheckCircle2 size={18} />
              <span>{profileNotice}</span>
              <button
                type="button"
                onClick={() => setProfileNotice('')}
                aria-label="Dismiss profile notification"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {error && (
            <div className="op-alert op-alert-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {notice && (
            <div className="op-alert op-alert-success" role="status">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice('')}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {loading && page !== 'Workflows' ? (
            <section className="panel">
              <div className="empty-state">
                <Loader2 className="op-spin" size={28} />
                <strong>Loading workspace tasks...</strong>
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
              onViewTasks={viewTasksFromDashboard}
              onOpenAssistant={() => navigateTo('AI Assistant')}
            />
          ) : page === 'Tasks' ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>All tasks</h2>
                  <p>
                    Showing {visibleTasks.length} of {filteredTasks.length} matching tasks
                    {hasFilters ? ` (${tasks.length} total)` : ''}
                  </p>
                </div>

                <div className="search-box">
                  <Search size={17} />
                  <input
                    placeholder="Search tasks..."
                    value={search}
                    onChange={event => setSearch(event.target.value)}
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
                  onChange={event => setStatusFilter(event.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="All">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>

                <select
                  className="op-filter-select"
                  value={priorityFilter}
                  onChange={event => setPriorityFilter(event.target.value)}
                  aria-label="Filter by priority"
                >
                  <option value="All">All priorities</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>

                <select
                  className="op-filter-select"
                  value={ownerFilter}
                  onChange={event => setOwnerFilter(event.target.value)}
                  aria-label="Filter by owner"
                >
                  <option value="All">All owners</option>
                  {owners.map(owner => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>

                {hasFilters && (
                  <button
                    type="button"
                    className="op-clear-filters"
                    onClick={clearFilters}
                  >
                    <X size={14} />
                    Clear filters
                  </button>
                )}
              </div>

              <TaskTable
                tasks={visibleTasks}
                saving={saving}
                onView={task => setDetailsId(task.id)}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onStatusChange={changeStatus}
                hasFilters={hasFilters}
                onClearFilters={clearFilters}
              />

              {canToggleTasks && (
                <div className="task-list-footer">
                  <span>
                    Showing {visibleTasks.length} of {filteredTasks.length} tasks
                  </span>

                  <button
                    type="button"
                    onClick={() => setTasksExpanded(current => !current)}
                    aria-expanded={tasksExpanded}
                    className="task-list-toggle"
                  >
                    {tasksExpanded ? (
                      <>
                        <ChevronUp size={16} />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown size={16} />
                        View all ({filteredTasks.length})
                      </>
                    )}
                  </button>
                </div>
              )}
            </section>
          ) : page === 'AI Assistant' ? (
            <AIAssistant />
          ) : page === 'Approvals' ? (
            <Approvals />
          ) : page === 'Workflows' ? (
            <Workflows />
          ) : page === 'Activity Logs' ? (
            <ActivityLogs />
          ) : (
            <section className="panel feature-placeholder">
              <div className="empty-icon">
                <Sparkles size={28} />
              </div>
              <h2>{page}</h2>
              <p>This module is planned for the next development phase.</p>
              <span className="neutral-tag">Under development</span>
            </section>
          )}
        </div>
      </main>

      {/* TASK DETAILS MODAL */}
      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          onClose={() => setDetailsId(null)}
          onEdit={openEdit}
        />
      )}

      {/* TASK FORM MODAL */}
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

      {/* DELETE TASK MODAL */}
      {deleteTarget && (
        <DeleteTaskModal
          task={deleteTarget}
          saving={saving}
          onClose={() => {
            if (!saving) setDeleteTarget(null)
          }}
          onConfirm={() => void confirmDeleteTask()}
        />
      )}

      {/* PROFILE EDIT MODAL */}
      {editingProfile && (
        <div
          className="profile-modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              closeProfileEditor()
            }
          }}
        >
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="op-edit-profile-title"
          >
            <div className="profile-modal-header">
              <div>
                <span className="profile-modal-eyebrow">ACCOUNT SETTINGS</span>
                <h2 id="op-edit-profile-title">Edit Profile</h2>
                <p>
                  Update the name displayed in your OpsPilot workspace.
                </p>
              </div>

              <button
                type="button"
                className="profile-modal-close"
                onClick={closeProfileEditor}
                disabled={profileSaving}
                aria-label="Close profile editor"
              >
                <X size={18} />
              </button>
            </div>

            <div className="profile-preview">
              <div className="profile-preview-avatar">
                {userInitials}
              </div>
              <div>
                <strong>{userName}</strong>
                <span>{userEmail}</span>
              </div>
            </div>

            <form onSubmit={saveProfile}>
              <label htmlFor="op-profile-name">Full name</label>
              <input
                id="op-profile-name"
                type="text"
                autoComplete="name"
                autoFocus
                required
                minLength={2}
                maxLength={100}
                value={profileName}
                onChange={event => setProfileName(event.target.value)}
                placeholder="Enter your full name"
                disabled={profileSaving}
              />

              <p className="profile-field-help">
                This name will appear in your sidebar and account menu.
              </p>

              {profileError && (
                <div className="profile-form-error" role="alert">
                  <AlertCircle size={16} />
                  {profileError}
                </div>
              )}

              <div className="profile-modal-actions">
                <button
                  type="button"
                  className="profile-cancel-button"
                  onClick={closeProfileEditor}
                  disabled={profileSaving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="profile-save-button"
                  disabled={profileSaving}
                >
                  {profileSaving && (
                    <Loader2 size={16} className="op-spin" />
                  )}
                  {profileSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
