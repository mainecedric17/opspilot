
export type Priority = 'Low' | 'Medium' | 'High'

export type TaskStatus =
  | 'Pending'
  | 'In Progress'
  | 'Completed'

export type Task = {
  id: string
  title: string
  description: string | null
  owner: string
  priority: Priority
  status: TaskStatus
  created_at: string
  updated_at: string
}

export type TaskForm = {
  title: string
  description: string
  owner: string
  priority: Priority
  status: TaskStatus
}

export const emptyForm: TaskForm = {
  title: '',
  description: '',
  owner: 'Operations',
  priority: 'Medium',
  status: 'Pending'
}
