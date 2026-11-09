
import { supabase } from '../lib/supabaseClient'

// --------------------------------------------------
// API CONFIGURATION
// --------------------------------------------------

const API_URL = (
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001'
).replace(/\/+$/, '')


// --------------------------------------------------
// API ERROR
// --------------------------------------------------

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)

    this.name = 'ApiError'
    this.status = status
  }
}


// --------------------------------------------------
// AUTHENTICATED API REQUEST
// --------------------------------------------------

export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {

  // Get the current Supabase session.

  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession()

  if (sessionError) {
    throw new ApiError(
      'Unable to retrieve authentication session.',
      401
    )
  }

  if (!session?.access_token) {
    throw new ApiError(
      'Authentication required. Please sign in again.',
      401
    )
  }

  // Preserve existing headers and attach access token.

  const headers = new Headers(options?.headers)

  headers.set(
    'Authorization',
    `Bearer ${session.access_token}`
  )

  // Set JSON content type when appropriate.

  if (
    options?.body != null &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }

  // Send request to FastAPI.

  const normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`

  const response = await fetch(
    `${API_URL}${normalizedPath}`,
    {
      ...options,
      headers
    }
  )

  // Handle unauthorized requests.

  if (response.status === 401) {
    throw new ApiError(
      'Your session is invalid or expired. Please sign in again.',
      401
    )
  }

  // Handle other API errors.

  if (!response.ok) {
    let message = `Request failed: ${response.status}`

    try {
      const errorData = await response.json()

      if (typeof errorData?.detail === 'string') {
        message = errorData.detail
      }
    } catch {
      // Keep the default error message.
    }

    throw new ApiError(
      message,
      response.status
    )
  }

  // Handle empty responses.

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
