
import { useEffect, useRef, useState } from 'react'
import { taskService } from '../services/taskService'
import type {
  Task,
  TaskForm,
  TaskStatus
} from '../types/task'

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function loadTasks() {
      try {
        const data = await taskService.getAll()

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

  async function runMutation(
    operation: () => Promise<void>,
    failureMessage: string
  ): Promise<boolean> {
    if (busyRef.current) return false

    busyRef.current = true
    setSaving(true)
    setError('')

    try {
      await operation()
      return true
    } catch {
      setError(failureMessage)
      return false
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }

  async function createTask(form: TaskForm): Promise<boolean> {
    if (!form.title.trim() || !form.owner.trim()) {
      setError('Task title and owner are required.')
      return false
    }

    return runMutation(async () => {
      const created = await taskService.create({
        title: form.title.trim(),
        description: form.description.trim() || null,
        owner: form.owner.trim(),
        priority: form.priority
      })

      setTasks(current => [created, ...current])
      setNotice('Task created successfully.')
    }, 'Could not save task. Please check the backend.')
  }

  async function updateTask(
    taskId: string,
    form: TaskForm
  ): Promise<boolean> {
    if (!form.title.trim() || !form.owner.trim()) {
      setError('Task title and owner are required.')
      return false
    }

    return runMutation(async () => {
      const updated = await taskService.update(taskId, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        owner: form.owner.trim(),
        priority: form.priority,
        status: form.status
      })

      setTasks(current =>
        current.map(task =>
          task.id === updated.id ? updated : task
        )
      )

      setNotice('Task updated successfully.')
    }, 'Could not save task. Please check the backend.')
  }

  async function changeStatus(
    task: Task,
    status: TaskStatus
  ): Promise<void> {
    if (busyRef.current || task.status === status) return

    await runMutation(async () => {
      const updated = await taskService.update(
        task.id,
        { status }
      )

      setTasks(current =>
        current.map(item =>
          item.id === updated.id ? updated : item
        )
      )

      setNotice('Task status updated.')
    }, 'Could not update task status.')
  }

  async function deleteTask(taskId: string): Promise<boolean> {
    return runMutation(async () => {
      await taskService.delete(taskId)

      setTasks(current =>
        current.filter(task => task.id !== taskId)
      )

      setNotice('Task deleted successfully.')
    }, 'Could not delete task.')
  }

  return {
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
    deleteTask
  }
}
