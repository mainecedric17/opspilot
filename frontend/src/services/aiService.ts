
import { apiRequest } from './api'

export type TaskPriority = 'Low' | 'Medium' | 'High'

export type TaskProposalParameters = {
  title: string
  description: string
  owner: string
  priority: TaskPriority
}

export type AIProposalResponse = {
  action_type: string
  requires_approval: boolean
  status: string
  parameters: TaskProposalParameters | null
  clarification_question: string | null
  message: string
}

export type AISubmissionResponse = {
  proposal_id: string
  approval_id: string
  action_type: string
  parameters: TaskProposalParameters
  approval_status: string
  duplicate: boolean
  message: string
}

export type AIExecutionResponse = {
  proposal_id: string
  approval_id: string
  approval_status: string
  execution_id: string
  task_id: string
  task_title?: string
  task_status?: string
  executed_by: string
  executed_at: string
  already_executed: boolean
  message: string
}

export async function generateAIProposal(
  message: string
): Promise<AIProposalResponse> {
  return apiRequest<AIProposalResponse>(
    '/api/ai/propose-action',
    {
      method: 'POST',
      body: JSON.stringify({ message })
    }
  )
}

export async function submitAIProposal(
  parameters: TaskProposalParameters,
  idempotencyKey: string
): Promise<AISubmissionResponse> {
  return apiRequest<AISubmissionResponse>(
    '/api/ai/submit-proposal',
    {
      method: 'POST',
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        action_type: 'create_task',
        parameters
      })
    }
  )
}

export async function executeAIProposal(
  proposalId: string
): Promise<AIExecutionResponse> {
  return apiRequest<AIExecutionResponse>(
    `/api/ai/proposals/${encodeURIComponent(proposalId)}/execute`,
    {
      method: 'POST'
    }
  )
}
