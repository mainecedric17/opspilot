
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileClock,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react'

import { apiRequest, ApiError } from '../services/api'
import './Approvals.css'

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected'

type RequestType =
  | 'General'
  | 'Purchase'
  | 'Access'
  | 'Operations'
  | 'Other'

type Approval = {
  id: string
  title: string
  description: string
  request_type: RequestType
  requested_by: string
  status: ApprovalStatus
  reviewed_by: string | null
  decision_note: string | null
  created_at: string
  reviewed_at: string | null
}

type HistoryItem = {
  id: string
  action: string
  actor: string
  description: string
  created_at: string
}

type ExecutionStatus = {
  proposal_id: string
  approval_id: string
  action_type: string
  approval_status: ApprovalStatus
  already_executed: boolean
  execution_id: string | null
  task_id: string | null
  executed_at: string | null
}

type ExecutionResult = {
  proposal_id: string
  approval_id: string
  task_id: string
  already_executed: boolean
  message: string
}

type Filter = 'All' | ApprovalStatus
type Decision = 'approve' | 'reject' | null

const emptyRequest = {
  title: '',
  description: '',
  request_type: 'General' as RequestType,
  requested_by: ''
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function formatDate(date: string | null) {
  if (!date) return '—'

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila'
  }).format(new Date(date))
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila'
  }).format(new Date(date))
}

function cleanTitle(title: string) {
  return title.replace(/^AI Task Proposal:\s*/i, '')
}

// --------------------------------------------------
// COMPONENT
// --------------------------------------------------

export default function Approvals() {
  const [items, setItems] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [search, setSearch] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...emptyRequest })

  const [selected, setSelected] = useState<Approval | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [decision, setDecision] = useState<Decision>(null)
  const [note, setNote] = useState('')

  const [executionStatus, setExecutionStatus] =
    useState<ExecutionStatus | null>(null)

  const [executionLoading, setExecutionLoading] = useState(false)
  const [executionError, setExecutionError] = useState('')
  const [confirmExecution, setConfirmExecution] = useState(false)

  const selectionRef = useRef(0)
  const busyRef = useRef(false)

  // --------------------------------------------------
  // LOAD APPROVALS
  // --------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await apiRequest<Approval[]>(
        '/api/approvals?limit=100'
      )

      setItems(result)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load approvals.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // --------------------------------------------------
  // LOAD APPROVAL HISTORY
  // --------------------------------------------------

  async function loadHistory(
    approvalId: string,
    selectionId: number
  ) {
    setHistoryLoading(true)

    try {
      const result = await apiRequest<HistoryItem[]>(
        `/api/approvals/${encodeURIComponent(approvalId)}/history`
      )

      if (selectionRef.current === selectionId) {
        setHistory(result)
      }
    } catch (err) {
      if (selectionRef.current === selectionId) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load history.'
        )
      }
    } finally {
      if (selectionRef.current === selectionId) {
        setHistoryLoading(false)
      }
    }
  }

  // --------------------------------------------------
  // LOAD AI EXECUTION STATUS
  // --------------------------------------------------

  async function loadExecutionStatus(
    approvalId: string,
    selectionId: number
  ) {
    setExecutionLoading(true)
    setExecutionError('')

    try {
      const result = await apiRequest<ExecutionStatus>(
        `/api/ai/approvals/${encodeURIComponent(approvalId)}/execution-status`
      )

      if (selectionRef.current === selectionId) {
        setExecutionStatus(result)
      }
    } catch (err) {
      if (selectionRef.current === selectionId) {
        if (err instanceof ApiError && err.status === 404) {
          // Ordinary approval requests do not have
          // an associated AI action proposal.
          setExecutionStatus(null)
        } else {
          setExecutionError(
            err instanceof Error
              ? err.message
              : 'Unable to check AI execution status.'
          )
        }
      }
    } finally {
      if (selectionRef.current === selectionId) {
        setExecutionLoading(false)
      }
    }
  }

  // --------------------------------------------------
  // SELECT APPROVAL
  // --------------------------------------------------

  async function viewApproval(item: Approval) {
    if (busyRef.current) return

    const selectionId = ++selectionRef.current

    setSelected(item)
    setHistory([])
    setExecutionStatus(null)
    setExecutionError('')
    setDecision(null)
    setNote('')
    setConfirmExecution(false)
    setError('')
    setNotice('')

    await Promise.all([
      loadHistory(item.id, selectionId),
      loadExecutionStatus(item.id, selectionId)
    ])
  }

  function clearSelection() {
    if (busyRef.current) return

    selectionRef.current += 1

    setSelected(null)
    setHistory([])
    setExecutionStatus(null)
    setExecutionError('')
    setDecision(null)
    setNote('')
    setConfirmExecution(false)
  }

  function closeDetailsAfterMutation() {
    selectionRef.current += 1

    setSelected(null)
    setHistory([])
    setExecutionStatus(null)
    setExecutionError('')
    setDecision(null)
    setNote('')
    setConfirmExecution(false)
  }

  // --------------------------------------------------
  // CREATE APPROVAL REQUEST
  // --------------------------------------------------

  async function createApproval(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (busyRef.current) return

    busyRef.current = true
    setBusy(true)
    setError('')

    try {
      await apiRequest<Approval>('/api/approvals', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          request_type: form.request_type,
          requested_by: form.requested_by.trim()
        })
      })

      setShowCreate(false)
      setForm({ ...emptyRequest })
      setNotice('Approval request submitted successfully.')

      await load()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to submit request.'
      )
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  // --------------------------------------------------
  // APPROVE / REJECT
  // --------------------------------------------------

  async function submitDecision() {
    if (!selected || !decision || busyRef.current) return

    if (decision === 'reject' && !note.trim()) {
      setError('A rejection reason is required.')
      return
    }

    const approvalId = selected.id
    const action = decision

    busyRef.current = true
    setBusy(true)
    setError('')

    try {
      await apiRequest<Approval>(
        `/api/approvals/${encodeURIComponent(approvalId)}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({
            note: note.trim() || null
          })
        }
      )

      closeDetailsAfterMutation()

      setNotice(
        `Request ${
          action === 'approve' ? 'approved' : 'rejected'
        } successfully.`
      )

      await load()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to record decision.'
      )
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  // --------------------------------------------------
  // EXECUTE APPROVED AI PROPOSAL
  // --------------------------------------------------

  async function executeProposal() {
    if (
      !selected ||
      !executionStatus ||
      selected.status !== 'Approved' ||
      executionStatus.approval_status !== 'Approved' ||
      executionStatus.action_type !== 'create_task' ||
      executionStatus.already_executed ||
      !confirmExecution ||
      busyRef.current
    ) {
      return
    }

    const approvalId = selected.id
    const proposalId = executionStatus.proposal_id
    const selectionId = selectionRef.current

    busyRef.current = true
    setBusy(true)
    setExecutionError('')
    setError('')

    try {
      // Recheck the latest state before execution.
      const latest = await apiRequest<ExecutionStatus>(
        `/api/ai/approvals/${encodeURIComponent(approvalId)}/execution-status`
      )

      if (
        latest.proposal_id !== proposalId ||
        latest.approval_status !== 'Approved'
      ) {
        throw new Error(
          'Proposal or approval status changed. Please reopen this request.'
        )
      }

      if (latest.already_executed) {
        setExecutionStatus(latest)
        setConfirmExecution(false)
        setNotice('This AI proposal was already executed.')
        return
      }

      const result = await apiRequest<ExecutionResult>(
        `/api/ai/proposals/${encodeURIComponent(proposalId)}/execute`,
        { method: 'POST' }
      )

      setNotice(
        result.already_executed
          ? 'Already executed. No duplicate task was created.'
          : 'AI proposal executed. Task created successfully.'
      )

      setConfirmExecution(false)

      await Promise.all([
        loadHistory(approvalId, selectionId),
        loadExecutionStatus(approvalId, selectionId)
      ])
    } catch (err) {
      setExecutionError(
        err instanceof Error
          ? err.message
          : 'Unable to execute AI proposal.'
      )

      setConfirmExecution(false)

      await Promise.all([
        loadHistory(approvalId, selectionId),
        loadExecutionStatus(approvalId, selectionId)
      ])
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  // --------------------------------------------------
  // FILTERS AND COUNTS
  // --------------------------------------------------

  const visible = items.filter(item => {
    const matchesFilter =
      filter === 'All' || item.status === filter

    const matchesSearch =
      `${item.title} ${item.description} ${item.requested_by} ${item.request_type}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())

    return matchesFilter && matchesSearch
  })

  const counts = {
    All: items.length,
    Pending: items.filter(i => i.status === 'Pending').length,
    Approved: items.filter(i => i.status === 'Approved').length,
    Rejected: items.filter(i => i.status === 'Rejected').length
  }

  const canExecute =
    selected?.status === 'Approved' &&
    executionStatus?.approval_status === 'Approved' &&
    executionStatus?.action_type === 'create_task' &&
    !executionStatus.already_executed &&
    !executionLoading &&
    !executionError

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <section className="ap-page">
      {/* TOOLBAR */}

      <div className="ap-toolbar">
        <div>
          <h2>Approval inbox</h2>
          <p>
            Review requests, make decisions, and manage AI actions.
          </p>
        </div>

        <div className="ap-actions">
          <button
            type="button"
            className="ap-secondary"
            onClick={() => void load()}
            disabled={loading || busy}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            type="button"
            className="ap-primary"
            onClick={() => {
              setError('')
              setShowCreate(true)
            }}
            disabled={busy}
          >
            <Plus size={17} />
            New request
          </button>
        </div>
      </div>

      {/* DEVELOPMENT WARNING */}

      <p className="ap-demo">
        <ShieldCheck size={15} />
        Development mode: reviewer identity is not authenticated.
        Do not use for real approvals.
      </p>

      {/* ERROR MESSAGE */}

      {error && (
        <div className="ap-message ap-error" role="alert">
          <AlertCircle size={17} />
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

      {/* SUCCESS MESSAGE */}

      {notice && (
        <div className="ap-message ap-success" role="status">
          <Check size={17} />
          <span>{notice}</span>

          <button
            type="button"
            onClick={() => setNotice('')}
            aria-label="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* STATISTICS */}

      <div className="ap-stats">
        {(
          ['All', 'Pending', 'Approved', 'Rejected'] as Filter[]
        ).map(key => (
          <button
            key={key}
            type="button"
            className={`ap-stat ${
              filter === key ? 'ap-stat-active' : ''
            }`}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
          >
            <span>
              {key === 'All' ? 'All requests' : key}
            </span>
            <strong>{counts[key]}</strong>
          </button>
        ))}
      </div>

      {/* MAIN WORKSPACE */}

      <div className="ap-workspace">
        {/* APPROVAL INBOX */}

        <aside className="ap-inbox">
          <div className="ap-inbox-header">
            <div>
              <h3>Requests</h3>
              <p>{visible.length} matching requests</p>
            </div>

            <Inbox size={19} />
          </div>

          <div className="ap-inbox-search">
            <Search size={17} />

            <input
              aria-label="Search approval requests"
              placeholder="Search requests..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="ap-inbox-list">
            {loading ? (
              <div className="ap-empty">
                <Loader2 className="ap-spin" size={22} />
                Loading requests...
              </div>
            ) : visible.length === 0 ? (
              <div className="ap-empty">
                <FileClock size={23} />
                No matching requests.
              </div>
            ) : (
              visible.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`ap-inbox-item ${
                    selected?.id === item.id
                      ? 'ap-inbox-item-active'
                      : ''
                  }`}
                  onClick={() => void viewApproval(item)}
                  aria-pressed={selected?.id === item.id}
                  disabled={busy}
                >
                  <div className="ap-inbox-item-top">
                    <span className="ap-inbox-type">
                      {item.title.startsWith('AI Task Proposal:')
                        ? <Sparkles size={14} />
                        : <FileClock size={14} />}

                      {item.title.startsWith('AI Task Proposal:')
                        ? 'AI proposal'
                        : item.request_type}
                    </span>

                    <span className="ap-inbox-date">
                      {shortDate(item.created_at)}
                    </span>
                  </div>

                  <strong>{cleanTitle(item.title)}</strong>

                  <span className="ap-inbox-requester">
                    {item.requested_by}
                  </span>

                  <div className="ap-inbox-item-bottom">
                    <span
                      className={`ap-pill ap-${item.status.toLowerCase()}`}
                    >
                      {item.status}
                    </span>

                    <ChevronRight size={16} />
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* REVIEW PANEL */}

        <main className="ap-review-panel">
          {!selected ? (
            <div className="ap-review-empty">
              <div className="ap-review-empty-icon">
                <Inbox size={29} />
              </div>

              <h3>Select a request</h3>

              <p>
                Choose a request from the inbox to review its
                details, decisions, and activity history.
              </p>
            </div>
          ) : (
            <>
              {/* REVIEW HEADER */}

              <div className="ap-review-header">
                <div className="ap-review-header-content">
                  <span className="ap-review-eyebrow">
                    {selected.title.startsWith('AI Task Proposal:')
                      ? 'AI TASK PROPOSAL'
                      : `${selected.request_type.toUpperCase()} REQUEST`}
                  </span>

                  <h3>{cleanTitle(selected.title)}</h3>

                  <div className="ap-review-badges">
                    <span
                      className={`ap-pill ap-${selected.status.toLowerCase()}`}
                    >
                      {selected.status}
                    </span>

                    {executionStatus?.already_executed && (
                      <span className="ap-pill ap-executed">
                        <CheckCircle2 size={13} />
                        Executed
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="ap-icon-button"
                  onClick={clearSelection}
                  disabled={busy}
                  aria-label="Close request details"
                >
                  <X size={19} />
                </button>
              </div>

              {/* REVIEW BODY */}

              <div className="ap-review-body">
                <div className="ap-detail-grid">
                  <div>
                    <span className="ap-field-label">
                      Requested by
                    </span>
                    <strong>{selected.requested_by}</strong>
                  </div>

                  <div>
                    <span className="ap-field-label">
                      Request type
                    </span>
                    <strong>{selected.request_type}</strong>
                  </div>

                  <div>
                    <span className="ap-field-label">
                      Submitted
                    </span>
                    <strong>
                      {formatDate(selected.created_at)}
                    </strong>
                  </div>

                  <div>
                    <span className="ap-field-label">
                      Reviewed
                    </span>
                    <strong>
                      {formatDate(selected.reviewed_at)}
                    </strong>
                  </div>
                </div>

                {/* REQUEST DETAILS */}

                <div className="ap-review-section">
                  <h4>Request details</h4>

                  <div className="ap-description">
                    {selected.description}
                  </div>
                </div>

                {selected.reviewed_by && (
                  <div className="ap-review-meta">
                    Reviewed by {selected.reviewed_by}
                  </div>
                )}

                {selected.decision_note && (
                  <div className="ap-note">
                    <strong>Decision note</strong>
                    <p>{selected.decision_note}</p>
                  </div>
                )}

                {/* APPROVE / REJECT */}

                {selected.status === 'Pending' && (
                  <div className="ap-review-section ap-action-section">
                    <h4>Review this request</h4>

                    <p>
                      Review the details before making a decision.
                      Approval alone does not execute an AI action.
                    </p>

                    <div className="ap-actions">
                      <button
                        type="button"
                        className="ap-primary"
                        disabled={busy}
                        onClick={() => {
                          setDecision('approve')
                          setNote('')
                          setError('')
                        }}
                      >
                        <Check size={16} />
                        Approve
                      </button>

                      <button
                        type="button"
                        className="ap-secondary"
                        disabled={busy}
                        onClick={() => {
                          setDecision('reject')
                          setNote('')
                          setError('')
                        }}
                      >
                        <X size={16} />
                        Reject
                      </button>
                    </div>

                    {decision && (
                      <div className="ap-decision">
                        <label>
                          {decision === 'reject'
                            ? 'Rejection reason (required)'
                            : 'Decision note (optional)'}

                          <textarea
                            rows={3}
                            maxLength={2000}
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Add a decision note..."
                          />
                        </label>

                        <div className="ap-actions">
                          <button
                            type="button"
                            className="ap-secondary"
                            disabled={busy}
                            onClick={() => {
                              setDecision(null)
                              setNote('')
                            }}
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            className="ap-primary"
                            disabled={
                              busy ||
                              (decision === 'reject' && !note.trim())
                            }
                            onClick={() => void submitDecision()}
                          >
                            {busy
                              ? 'Saving...'
                              : `Confirm ${decision}`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* AI EXECUTION LOADING */}

                {executionLoading && (
                  <div className="ap-info-box">
                    <Loader2
                      className="ap-spin"
                      size={17}
                    />
                    Checking AI execution status...
                  </div>
                )}

                {/* AI EXECUTION ERROR */}

                {executionError && (
                  <div
                    className="ap-message ap-error"
                    role="alert"
                  >
                    <AlertCircle size={17} />
                    <span>{executionError}</span>

                    <button
                      type="button"
                      className="ap-secondary"
                      disabled={busy}
                      onClick={() => {
                        setExecutionStatus(null)

                        void loadExecutionStatus(
                          selected.id,
                          selectionRef.current
                        )
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* ALREADY EXECUTED */}

                {executionStatus &&
                  selected.status === 'Approved' &&
                  executionStatus.already_executed && (
                    <div className="ap-execution-card ap-execution-done">
                      <div className="ap-execution-heading">
                        <CheckCircle2 size={19} />
                        <h4>AI action completed</h4>
                      </div>

                      <p>
                        This approved AI proposal has already
                        created its task.
                      </p>

                      <div className="ap-execution-details">
                        <span>
                          Task ID: {executionStatus.task_id}
                        </span>

                        <span>
                          Executed:{' '}
                          {formatDate(executionStatus.executed_at)}
                        </span>
                      </div>

                      <small>
                        Duplicate execution is prevented by the backend.
                      </small>
                    </div>
                  )}

                {/* READY FOR EXECUTION */}

                {canExecute && executionStatus && (
                  <div className="ap-execution-card">
                    <div className="ap-execution-heading">
                      <Sparkles size={19} />
                      <h4>Ready for execution</h4>
                    </div>

                    <p>
                      This AI proposal has been approved.
                      The task has not been created yet.
                    </p>

                    <small>
                      Proposal ID: {executionStatus.proposal_id}
                    </small>

                    {!confirmExecution ? (
                      <button
                        type="button"
                        className="ap-primary"
                        disabled={busy}
                        onClick={() => setConfirmExecution(true)}
                      >
                        Execute approved proposal
                      </button>
                    ) : (
                      <div className="ap-confirm-box">
                        <p>
                          Confirm execution? This will create
                          the approved task in your workspace.
                        </p>

                        <div className="ap-actions">
                          <button
                            type="button"
                            className="ap-secondary"
                            disabled={busy}
                            onClick={() => setConfirmExecution(false)}
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            className="ap-primary"
                            disabled={busy}
                            onClick={() => void executeProposal()}
                          >
                            {busy
                              ? 'Executing...'
                              : 'Confirm execution'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ACTIVITY TIMELINE */}

                <div className="ap-review-section ap-history">
                  <h4>
                    <Clock3 size={17} />
                    Activity timeline
                  </h4>

                  {historyLoading ? (
                    <div className="ap-info-box">
                      <Loader2
                        className="ap-spin"
                        size={16}
                      />
                      Loading history...
                    </div>
                  ) : history.length === 0 ? (
                    <p className="ap-history-empty">
                      No activity recorded yet.
                    </p>
                  ) : (
                    <div className="ap-timeline">
                      {history.map(event => (
                        <div
                          className="ap-timeline-item"
                          key={event.id}
                        >
                          <div className="ap-timeline-dot" />

                          <div className="ap-timeline-content">
                            <strong>
                              {event.action.replaceAll('_', ' ')}
                            </strong>

                            <p>{event.description}</p>

                            <small>
                              {event.actor} ·{' '}
                              {formatDate(event.created_at)}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* NEW APPROVAL MODAL */}

      {showCreate && (
        <div
          className="ap-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget && !busy) {
              setShowCreate(false)
            }
          }}
        >
          <div
            className="ap-modal"
            role="dialog"
            aria-modal="true"
            aria-label="New approval request"
          >
            <div className="ap-modal-header">
              <div>
                <h3>New approval request</h3>
                <p>Submit a request for human review.</p>
              </div>

              <button
                type="button"
                className="ap-icon-button"
                onClick={() => setShowCreate(false)}
                disabled={busy}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form
              className="ap-form"
              onSubmit={e => void createApproval(e)}
            >
              <label>
                Title

                <input
                  required
                  maxLength={200}
                  value={form.title}
                  onChange={e =>
                    setForm({
                      ...form,
                      title: e.target.value
                    })
                  }
                  placeholder="e.g. Purchase new monitors"
                />
              </label>

              <label>
                Description

                <textarea
                  required
                  maxLength={5000}
                  rows={4}
                  value={form.description}
                  onChange={e =>
                    setForm({
                      ...form,
                      description: e.target.value
                    })
                  }
                  placeholder="Explain the request..."
                />
              </label>

              <div className="ap-form-row">
                <label>
                  Request type

                  <select
                    value={form.request_type}
                    onChange={e =>
                      setForm({
                        ...form,
                        request_type:
                          e.target.value as RequestType
                      })
                    }
                  >
                    {(
                      [
                        'General',
                        'Purchase',
                        'Access',
                        'Operations',
                        'Other'
                      ] as RequestType[]
                    ).map(type => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Requested by

                  <input
                    required
                    maxLength={100}
                    value={form.requested_by}
                    onChange={e =>
                      setForm({
                        ...form,
                        requested_by: e.target.value
                      })
                    }
                    placeholder="Your name"
                  />
                </label>
              </div>

              <div className="ap-modal-footer">
                <button
                  type="button"
                  className="ap-secondary"
                  disabled={busy}
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="ap-primary"
                  disabled={
                    busy ||
                    !form.title.trim() ||
                    !form.description.trim() ||
                    !form.requested_by.trim()
                  }
                >
                  {busy ? 'Submitting...' : 'Submit request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
