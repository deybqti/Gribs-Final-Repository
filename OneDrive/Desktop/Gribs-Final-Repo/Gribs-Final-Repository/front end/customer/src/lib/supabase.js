import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper functions for rooms
export const roomsApi = {
  // Get all rooms
  async getAllRooms() {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching rooms:', error)
      throw error
    }
    return data
  },

  // Get room by ID
  async getRoomById(id) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      console.error('Error fetching room:', error)
      throw error
    }
    return data
  },

  // Search rooms
  async searchRooms(searchTerm) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('status', 'available')
      .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error searching rooms:', error)
      throw error
    }
    return data
  },

  // Filter rooms by capacity
  async getRoomsByCapacity(capacity) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('status', 'available')
      .gte('capacity', capacity)
      .order('price', { ascending: true })
    
    if (error) {
      console.error('Error filtering rooms by capacity:', error)
      throw error
    }
    return data
  }
}
