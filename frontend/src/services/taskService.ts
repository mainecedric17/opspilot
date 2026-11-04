
import { apiRequest } from './api'
import type {
  Task,
  Priority,
  TaskStatus,
} from '../types/task'

export type CreateTaskPayload = {
  title: string
  description: string | null
  owner: string
  priority: Priority
}

export type UpdateTaskPayload =
  Partial<CreateTaskPayload> & {
    status?: TaskStatus
  }

export const taskService = {
  getAll(): Promise<Task[]> {
    return apiRequest<Task[]>('/api/tasks')
  },

  create(data: CreateTaskPayload): Promise<Task> {
    return apiRequest<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  update(
    id: string,
    data: UpdateTaskPayload
  ): Promise<Task> {
    return apiRequest<Task>(
      `/api/tasks/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    )
  },

  delete(id: string): Promise<void> {
    return apiRequest<void>(
      `/api/tasks/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    )
  },
}
