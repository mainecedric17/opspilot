
import { useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react'

type ActivityLog = {
  id: string
  task_id: string | null
  action: string
  description: string
  actor: string
  created_at: string
}

const API_URL = 'http://127.0.0.1:8000'

const actionLabels: Record<string, string> = {
  TASK_CREATED: 'Task created',
  TASK_UPDATED: 'Task updated',
  TASK_STATUS_CHANGED: 'Status changed',
  TASK_DELETED: 'Task deleted'
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  })
}

function formatTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Unknown time'

  return date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila'
  })
}

function getActionIcon(action: string) {
  switch (action) {
    case 'TASK_CREATED':
      return <Plus size={17} />
    case 'TASK_UPDATED':
      return <Pencil size={16} />
    case 'TASK_STATUS_CHANGED':
      return <CheckCircle2 size={17} />
    case 'TASK_DELETED':
      return <Trash2 size={16} />
    default:
      return <Activity size={17} />
  }
}

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  async function loadLogs(showRefreshing = false) {
    if (showRefreshing) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const response = await fetch(
        `${API_URL}/api/activity-logs?limit=100`
      )

      if (!response.ok) {
        throw new Error('Failed to load activity logs')
      }

      const data: ActivityLog[] = await response.json()
      setLogs(data)
    } catch {
      setError(
        'Unable to load activity history. Check your backend connection.'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadLogs()
  }, [])

  const filteredLogs = logs.filter(log => {
    const matchesAction =
      filter === 'All' || log.action === filter

    const matchesSearch =
      `${log.description} ${log.actor} ${log.action}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())

    return matchesAction && matchesSearch
  })

  const createdCount = logs.filter(
    log => log.action === 'TASK_CREATED'
  ).length

  const updatedCount = logs.filter(
    log =>
      log.action === 'TASK_UPDATED' ||
      log.action === 'TASK_STATUS_CHANGED'
  ).length

  const deletedCount = logs.filter(
    log => log.action === 'TASK_DELETED'
  ).length

  const hasFilters = filter !== 'All' || search.trim() !== ''

  function clearFilters() {
    setFilter('All')
    setSearch('')
  }

  return (
    <section className="panel op-activity-panel">
      <div className="op-activity-header">
        <div>
          <div className="op-activity-heading-row">
            <h2>Activity history</h2>
            <span className="op-activity-count">
              {logs.length} recent
            </span>
          </div>

          <p>
            A record of task changes in your workspace.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={refreshing || loading}
          onClick={() => void loadLogs(true)}
        >
          <RefreshCw
            size={15}
            className={refreshing ? 'op-spin' : ''}
          />
          Refresh
        </button>
      </div>

      <div className="op-activity-summary">
        <div className="op-activity-summary-item">
          <span>Total events</span>
          <strong>{logs.length}</strong>
        </div>

        <div className="op-activity-summary-item">
          <span>Created</span>
          <strong>{createdCount}</strong>
        </div>

        <div className="op-activity-summary-item">
          <span>Updated</span>
          <strong>{updatedCount}</strong>
        </div>

        <div className="op-activity-summary-item">
          <span>Deleted</span>
          <strong>{deletedCount}</strong>
        </div>
      </div>

      <div className="op-activity-toolbar">
        <div className="search-box">
          <Search size={17} />

          <input
            type="text"
            placeholder="Search activity history..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search activity logs"
          />
        </div>

        <select
          className="op-filter-select"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          aria-label="Filter activities by action"
        >
          <option value="All">All activities</option>
          <option value="TASK_CREATED">Task created</option>
          <option value="TASK_UPDATED">Task updated</option>
          <option value="TASK_STATUS_CHANGED">
            Status changed
          </option>
          <option value="TASK_DELETED">Task deleted</option>
        </select>

        {hasFilters && (
          <button
            type="button"
            className="op-clear-filters"
            onClick={clearFilters}
          >
            <X size={14} />
            Clear
          </button>
        )}
      </div>

      {error && (
        <div
          className="op-alert op-alert-error"
          role="alert"
          style={{ margin: '0 24px 16px' }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <Loader2 className="op-spin" size={27} />
          <strong>Loading activity history...</strong>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Activity size={24} />
          </div>

          <strong>No activities found</strong>

          <p>
            {logs.length === 0
              ? 'Task changes will appear here automatically.'
              : 'Try adjusting your search or activity filter.'}
          </p>

          {hasFilters && (
            <button
              type="button"
              className="op-clear-filters"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="op-activity-list">
          {filteredLogs.map(log => (
            <article
              className="op-activity-item"
              key={log.id}
            >
              <div
                className={`op-activity-icon ${log.action.toLowerCase().replaceAll('_', '-')}`}
              >
                {getActionIcon(log.action)}
              </div>

              <div className="op-activity-content">
                <div className="op-activity-item-heading">
                  <span className="op-activity-title">
                    {actionLabels[log.action] ?? log.action}
                  </span>

                  <time
                    className="op-activity-time"
                    dateTime={log.created_at}
                  >
                    {formatTime(log.created_at)}
                  </time>
                </div>

                <p>{log.description}</p>

                <div className="op-activity-meta">
                  <span>{log.actor}</span>

                  <span className="op-activity-separator">
                    ·
                  </span>

                  <Clock3 size={13} />

                  <span>
                    {formatDate(log.created_at)}
                  </span>

                  {log.task_id && (
                    <>
                      <span className="op-activity-separator">
                        ·
                      </span>

                      <span
                        className="op-activity-task-ref"
                        title={log.task_id}
                      >
                        Task #{log.task_id.slice(0, 8)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && (
        <div className="op-activity-footer">
          <span>
            Showing {filteredLogs.length} of {logs.length} recent events
          </span>

          <span>Times shown in Philippine Time (PHT)</span>
        </div>
      )}
    </section>
  )
}
