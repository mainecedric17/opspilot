
import { useEffect, useRef, useState } from 'react'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  Bot,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  AlertCircle,
  ClipboardCheck,
  MessageSquare,
  CheckCircle2
} from 'lucide-react'

import {
  generateAIProposal,
  submitAIProposal,
  type TaskProposalParameters
} from '../services/aiService'

import { apiRequest } from '../services/api'

import './AIAssistant.css'

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type ChatResponse = {
  reply: string
  tasks_analyzed: number
}

type AssistantMode = 'chat' | 'create'

type Proposal = {
  parameters: TaskProposalParameters
  message: string
}

type Submission = {
  proposalId: string
  approvalId: string
  status: string
}

// --------------------------------------------------
// SUGGESTIONS
// --------------------------------------------------

const suggestions = [
  'Which tasks should I prioritize first?',
  'Identify possible bottlenecks in my workspace.',
  'Summarize my current workload.',
  'Which high-priority tasks are still pending?'
]

const createSuggestions = [
  'Create a high-priority task for Maine to review the monthly operations report.',
  'Create a task for Operations to review pending customer requests.',
  'Create a medium-priority task for Maine to document the current workflow.'
]

// --------------------------------------------------
// COMPONENT
// --------------------------------------------------

export default function AIAssistant() {
  const [mode, setMode] = useState<AssistantMode>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [taskCount, setTaskCount] = useState<number | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)
  const submittingRef = useRef(false)

  // --------------------------------------------------
  // AUTO SCROLL
  // --------------------------------------------------

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end'
    })
  }, [messages, loading, proposal, submission])

  // --------------------------------------------------
  // CLEANUP
  // --------------------------------------------------

  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  // --------------------------------------------------
  // SEND MESSAGE
  // --------------------------------------------------

  async function sendMessage(raw: string) {
    const content = raw.trim()

    if (
      !content ||
      inFlightRef.current ||
      submittingRef.current ||
      content.length > 2000
    ) {
      return
    }

    const controller = new AbortController()
    const currentMode = mode
    const history = messages.slice(-10)

    controllerRef.current = controller
    inFlightRef.current = true

    setLoading(true)
    setError('')
    setDraft('')

    if (currentMode === 'create') {
      setProposal(null)
      setSubmission(null)
      setIdempotencyKey(null)
    }

    setMessages(previous => [
      ...previous,
      { role: 'user', content }
    ])

    try {
      if (currentMode === 'chat') {
        // apiRequest automatically retrieves the current
        // Supabase access token and sends it as a Bearer token.

        const result = await apiRequest<ChatResponse>(
          '/api/ai/chat',
          {
            method: 'POST',
            body: JSON.stringify({
              message: content,
              history
            }),
            signal: controller.signal
          }
        )

        if (
          typeof result.reply !== 'string' ||
          !result.reply.trim()
        ) {
          throw new Error('AI returned an empty response.')
        }

        if (controller.signal.aborted) return

        setMessages(previous => [
          ...previous,
          {
            role: 'assistant',
            content: result.reply
          }
        ])

        setTaskCount(result.tasks_analyzed)
      } else {
        // Proposal generation remains separate from
        // task execution and requires human approval.

        const result = await generateAIProposal(content)

        if (controller.signal.aborted) return

        if (
          result.action_type === 'create_task' &&
          result.requires_approval === true &&
          result.parameters
        ) {
          setProposal({
            parameters: result.parameters,
            message: result.message
          })

          setIdempotencyKey(crypto.randomUUID())

          setMessages(previous => [
            ...previous,
            {
              role: 'assistant',
              content: result.message
            }
          ])
        } else {
          setMessages(previous => [
            ...previous,
            {
              role: 'assistant',
              content:
                result.clarification_question ||
                result.message ||
                'Unable to generate a task proposal.'
            }
          ])
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to contact the AI service.'
        )
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }

      inFlightRef.current = false
      setLoading(false)
    }
  }

  // --------------------------------------------------
  // SUBMIT PROPOSAL
  // --------------------------------------------------

  async function submitProposal() {
    if (
      !proposal ||
      !idempotencyKey ||
      submittingRef.current ||
      inFlightRef.current ||
      submission
    ) {
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setError('')

    try {
      const result = await submitAIProposal(
        proposal.parameters,
        idempotencyKey
      )

      setSubmission({
        proposalId: result.proposal_id,
        approvalId: result.approval_id,
        status: result.approval_status
      })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to submit the proposal.'
      )
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  // --------------------------------------------------
  // CHANGE MODE
  // --------------------------------------------------

  function changeMode(nextMode: AssistantMode) {
    if (
      nextMode === mode ||
      inFlightRef.current ||
      submittingRef.current
    ) {
      return
    }

    setMode(nextMode)
    setMessages([])
    setDraft('')
    setError('')
    setTaskCount(null)
    setProposal(null)
    setSubmission(null)
    setIdempotencyKey(null)
  }

  // --------------------------------------------------
  // CLEAR CHAT
  // --------------------------------------------------

  function clearChat() {
    if (submittingRef.current) return

    controllerRef.current?.abort()
    controllerRef.current = null
    inFlightRef.current = false

    setLoading(false)
    setMessages([])
    setTaskCount(null)
    setDraft('')
    setError('')
    setProposal(null)
    setSubmission(null)
    setIdempotencyKey(null)
  }

  const busy = loading || submitting

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <section
      className="ai-panel"
      aria-label="OpsPilot AI Assistant"
    >
      <div className="ai-panel-header">
        <div className="ai-panel-identity">
          <span className="ai-avatar">
            <Bot size={22} />
          </span>

          <div>
            <h2>OpsPilot AI</h2>
            <p>
              Workspace insights and AI-assisted task proposals
            </p>
          </div>
        </div>

        <button
          type="button"
          className="ai-clear"
          onClick={clearChat}
          disabled={
            busy ||
            (messages.length === 0 && !proposal)
          }
        >
          <Trash2 size={15} />
          Clear chat
        </button>
      </div>

      {/* MODE SELECTION */}

      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '14px 24px',
          borderBottom: '1px solid #303048'
        }}
      >
        <button
          type="button"
          onClick={() => changeMode('chat')}
          disabled={busy}
          aria-pressed={mode === 'chat'}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 10,
            cursor: busy ? 'default' : 'pointer',
            border:
              mode === 'chat'
                ? '1px solid #9a7bff'
                : '1px solid #393650',
            background:
              mode === 'chat'
                ? '#44327e'
                : '#1d1c30',
            color: '#f3f2ff'
          }}
        >
          <MessageSquare
            size={16}
            style={{ marginRight: 8 }}
          />
          Ask AI
        </button>

        <button
          type="button"
          onClick={() => changeMode('create')}
          disabled={busy}
          aria-pressed={mode === 'create'}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 10,
            cursor: busy ? 'default' : 'pointer',
            border:
              mode === 'create'
                ? '1px solid #9a7bff'
                : '1px solid #393650',
            background:
              mode === 'create'
                ? '#44327e'
                : '#1d1c30',
            color: '#f3f2ff'
          }}
        >
          <Sparkles
            size={16}
            style={{ marginRight: 8 }}
          />
          Create with AI
        </button>
      </div>

      {/* MESSAGES */}

      <div className="ai-messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="ai-welcome">
            <span className="ai-welcome-icon">
              <Sparkles size={28} />
            </span>

            <h3>
              {mode === 'chat'
                ? 'What can I help you analyze?'
                : 'What task should I propose?'}
            </h3>

            <p>
              {mode === 'chat'
                ? 'Ask about priorities, bottlenecks, or workload using tasks from your workspace.'
                : 'Describe a task. OpsPilot AI will prepare a proposal for your review before submission.'}
            </p>

            <div className="ai-suggestions">
              {(mode === 'chat'
                ? suggestions
                : createSuggestions
              ).map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  disabled={busy}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`ai-message ai-message-${message.role}`}
          >
            <span className="ai-message-label">
              {message.role === 'assistant'
                ? 'OpsPilot AI'
                : 'You'}
            </span>

            <div className="ai-bubble">
              {message.role === 'assistant' ? (
                <div className="ai-markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                message.content
              )}
            </div>
          </div>
        ))}

        {/* LOADING */}

        {loading && (
          <div className="ai-message ai-message-assistant">
            <span className="ai-message-label">
              OpsPilot AI
            </span>

            <div className="ai-bubble ai-thinking">
              <Loader2
                size={16}
                className="ai-spin"
              />

              {mode === 'chat'
                ? 'Analyzing workspace...'
                : 'Preparing task proposal...'}
            </div>
          </div>
        )}

        {/* AI TASK PROPOSAL */}

        {mode === 'create' && proposal && (
          <div
            style={{
              background: '#1d1c30',
              border: '1px solid #51446f',
              borderRadius: 13,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9
              }}
            >
              <ClipboardCheck
                size={19}
                color="#b5a0ff"
              />

              <strong>AI Task Proposal</strong>
            </div>

            <div>
              <strong>Title</strong>
              <p>{proposal.parameters.title}</p>
            </div>

            <div>
              <strong>Description</strong>
              <p>{proposal.parameters.description}</p>
            </div>

            <div>
              <strong>Owner</strong>
              <p>{proposal.parameters.owner}</p>
            </div>

            <div>
              <strong>Priority</strong>
              <p>{proposal.parameters.priority}</p>
            </div>

            {submission ? (
              <div
                style={{
                  background: '#203c35',
                  border: '1px solid #387b65',
                  borderRadius: 10,
                  padding: 12
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <CheckCircle2 size={18} />

                  <strong>
                    Submitted — {submission.status}
                  </strong>
                </div>

                <p
                  style={{
                    marginTop: 8,
                    fontSize: 13
                  }}
                >
                  Proposal ID: {submission.proposalId}
                </p>

                <p
                  style={{
                    marginTop: 5,
                    fontSize: 13
                  }}
                >
                  Approval ID: {submission.approvalId}
                </p>

                <p
                  style={{
                    marginTop: 8,
                    fontSize: 13
                  }}
                >
                  No task has been created by this submission.
                  Human approval is required.
                </p>
              </div>
            ) : (
              <>
                <p
                  style={{
                    color: '#b9b1d3',
                    fontSize: 13
                  }}
                >
                  Review the proposed task before submitting.
                  Submission creates a pending approval request,
                  not an actual task.
                </p>

                <button
                  type="button"
                  onClick={() => void submitProposal()}
                  disabled={busy}
                  style={{
                    background: '#7758db',
                    color: '#fff',
                    border: 0,
                    borderRadius: 9,
                    padding: 12,
                    cursor: busy ? 'default' : 'pointer',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  {submitting ? (
                    <Loader2
                      size={17}
                      className="ai-spin"
                    />
                  ) : (
                    <ClipboardCheck size={17} />
                  )}

                  Submit for Approval
                </button>
              </>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* COMPOSE AREA */}

      <div className="ai-compose-area">
        {error && (
          <div
            className="ai-error"
            role="alert"
          >
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {mode === 'chat' && taskCount !== null && (
          <p className="ai-task-count">
            Last response analyzed {taskCount}{' '}
            task{taskCount === 1 ? '' : 's'}.
          </p>
        )}

        <form
          className="ai-compose"
          onSubmit={event => {
            event.preventDefault()
            void sendMessage(draft)
          }}
        >
          <textarea
            value={draft}
            onChange={event =>
              setDraft(event.target.value)
            }
            onKeyDown={event => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void sendMessage(draft)
              }
            }}
            placeholder={
              mode === 'chat'
                ? 'Ask OpsPilot AI about your tasks...'
                : 'Describe a task to propose...'
            }
            maxLength={2000}
            rows={2}
            aria-label="Message to OpsPilot AI"
            disabled={busy}
          />

          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Send message"
          >
            <Send size={19} />
          </button>
        </form>

        <p className="ai-disclaimer">
          {mode === 'chat'
            ? 'AI suggestions are read-only. Review recommendations before acting.'
            : 'AI proposals require human approval. Submitting a proposal does not create a task.'}
        </p>
      </div>
    </section>
  )
}
