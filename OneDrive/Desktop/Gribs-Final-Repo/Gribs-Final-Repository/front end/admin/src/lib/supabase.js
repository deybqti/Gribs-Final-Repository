import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Simple admin auth using backend-issued JWT stored in localStorage
const ADMIN_TOKEN_KEY = 'admin_token'
const ADMIN_USER_KEY = 'admin_user'

const getAuthToken = () => {
  try { return localStorage.getItem(ADMIN_TOKEN_KEY) || null } catch (_) { return null }
}

const getAuthHeaders = () => {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const adminAuth = {
  async login(username, password) {
    const res = await fetch('http://localhost:4000/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { const j = await res.json(); msg = j.error || msg } catch (_) {}
      throw new Error(msg)
    }
    const data = await res.json()
    if (!data?.token) throw new Error('Invalid login response')
    try {
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token)
      if (data.user) localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(data.user))
    } catch (_) { /* ignore storage errors */ }
    try { window.dispatchEvent(new Event('admin-auth-changed')) } catch (_) {}
    return data
  },
  logout() {
    try {
      localStorage.removeItem(ADMIN_TOKEN_KEY)
      localStorage.removeItem(ADMIN_USER_KEY)
    } catch (_) { /* noop */ }
    try { window.dispatchEvent(new Event('admin-auth-changed')) } catch (_) {}
  },
  getToken: getAuthToken,
  getUser() {
    try { const v = localStorage.getItem(ADMIN_USER_KEY); return v ? JSON.parse(v) : null } catch (_) { return null }
  }
}

// Customers API functions
export const customersApi = {
  async getAllCustomers() {
    try {
      const res = await fetch('http://localhost:4000/api/customers', {
        headers: { ...getAuthHeaders() }
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      return data
    } catch (error) {
      console.error('Error fetching customers:', error)
      throw error
    }
  }
}

// Helper functions for rooms management
export const roomsApi = {
  // Get all rooms (including archived for admin)
  async getAllRooms() {
    try {
      const response = await fetch('http://localhost:4000/api/rooms', {
        headers: { ...getAuthHeaders() }
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error fetching rooms:', error)
      throw error
    }
  },

  // Get room by ID
  async getRoomById(id) {
    try {
      const response = await fetch(`http://localhost:4000/api/rooms/${id}`, {
        headers: { ...getAuthHeaders() }
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error fetching room:', error)
      throw error
    }
  },

  // Create new room
  async createRoom(roomData) {
    try {
      const response = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(roomData)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      return data.room
    } catch (error) {
      console.error('Error creating room:', error)
      throw error
    }
  },

  // Update room
  async updateRoom(id, roomData) {
    try {
      const response = await fetch(`http://localhost:4000/api/rooms/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(roomData)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      return data.room
    } catch (error) {
      console.error('Error updating room:', error)
      throw error
    }
  },

  // Delete room
  async deleteRoom(id) {
    try {
      const response = await fetch(`http://localhost:4000/api/rooms/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      return data.room
    } catch (error) {
      console.error('Error deleting room:', error)
      throw error
    }
  },

  // Update room status
  async updateRoomStatus(id, status) {
    try {
      const response = await fetch(`http://localhost:4000/api/rooms/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ status })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      return data.room
    } catch (error) {
      console.error('Error updating room status:', error)
      throw error
    }
  },

  // Search rooms
  async searchRooms(searchTerm) {
    try {
      const response = await fetch(`http://localhost:4000/api/rooms?search=${encodeURIComponent(searchTerm)}`, {
        headers: { ...getAuthHeaders() }
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error searching rooms:', error)
      throw error
    }
  }
}

// Dashboard API functions
export const dashboardApi = {
  // Get dashboard statistics
  async getDashboardStats() {
    try {
      console.log('Fetching dashboard stats from: http://localhost:4000/api/dashboard/stats')
      const response = await fetch('http://localhost:4000/api/dashboard/stats', {
        headers: { ...getAuthHeaders() }
      })
      console.log('Dashboard stats response status:', response.status)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      console.log('Dashboard stats data received:', data)
      return data
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
      throw error
    }
  },

  // Get dashboard rooms preview
  async getDashboardRooms() {
    try {
      console.log('Fetching dashboard rooms from: http://localhost:4000/api/dashboard/rooms')
      const response = await fetch('http://localhost:4000/api/dashboard/rooms', {
        headers: { ...getAuthHeaders() }
      })
      console.log('Dashboard rooms response status:', response.status)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      console.log('Dashboard rooms data received:', data)
      return data
    } catch (error) {
      console.error('Error fetching dashboard rooms:', error)
      throw error
    }
  }
}
