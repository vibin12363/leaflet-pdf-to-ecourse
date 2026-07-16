import { auth } from './firebase'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.detail || `Request failed (${res.status})`)
  }
  return res.json()
}

export const api = {
  uploadPdf: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/api/documents', { method: 'POST', body: form })
  },
  listCourses: () => request('/api/courses'),
  deleteCourse: (id) => request(`/api/courses/${id}`, { method: 'DELETE' }),
  retryCourse: (id) => request(`/api/courses/${id}/retry`, { method: 'POST' }),
  getCourse: (id) => request(`/api/courses/${id}`),
  getLesson: (courseId, lessonId) => request(`/api/courses/${courseId}/lessons/${lessonId}`),
  completeLesson: (courseId, lessonId, seconds) =>
    request(`/api/courses/${courseId}/lessons/${lessonId}/complete`, {
      method: 'POST', body: JSON.stringify({ seconds_spent: seconds }),
    }),
  setResume: (courseId, lessonId) =>
    request(`/api/courses/${courseId}/resume`, {
      method: 'POST', body: JSON.stringify({ lesson_id: lessonId }),
    }),
  summary: () => request('/api/progress/summary'),
  chatHistory: (courseId) => request(`/api/courses/${courseId}/chat`),
  sendChat: (courseId, message) =>
    request(`/api/courses/${courseId}/chat`, { method: 'POST', body: JSON.stringify({ message }) }),
  getQuiz: (courseId, chapterIndex) =>
    request(`/api/courses/${courseId}/chapters/${chapterIndex}/quiz`, { method: 'POST' }),
  submitQuiz: (quizId, answers) =>
    request(`/api/quizzes/${quizId}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }),
  search: (q, courseId) =>
    request(`/api/search?q=${encodeURIComponent(q)}${courseId ? `&course_id=${courseId}` : ''}`),
}