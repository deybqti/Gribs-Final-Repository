import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ============================
// Reservation functions
// ============================
export const reservationService = {
  // Create a new reservation using server API
  async createReservation(reservationData) {
    try {
      console.log('Creating reservation with data:', reservationData);
      
      const response = await fetch('http://localhost:4000/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reservationData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Reservation created successfully:', data);

      // ✅ Normalize return shape (always return reservation/booking object with id)
      // Server returns { message, booking }
      const reservation = data.booking ? data.booking : (data.reservation ? data.reservation : data);

      return { success: true, data: reservation };
    } catch (error) {
      console.error('Error creating reservation:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to create reservation' 
      };
    }
  },

  // Get user's reservations by user_name (full name or email) using server API
  async getUserReservations(userName) {
    try {
      const response = await fetch(`http://localhost:4000/api/bookings/customer/${encodeURIComponent(userName)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching reservations:', error);
      return { success: false, error: error.message };
    }
  },

  // Get reservation by ID using server API
  async getReservationById(reservationId) {
    try {
      const response = await fetch(`http://localhost:4000/api/bookings/${reservationId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching reservation:', error);
      return { success: false, error: error.message };
    }
  },

  // Update reservation status using server API
  async updateReservationStatus(reservationId, status) {
    try {
      const response = await fetch(`http://localhost:4000/api/bookings/${reservationId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Error updating reservation:', error);
      return { success: false, error: error.message };
    }
  },

  // Update arbitrary reservation fields (e.g., special_requests)
  async updateReservation(reservationId, fields) {
    try {
      const response = await fetch(`http://localhost:4000/api/bookings/${encodeURIComponent(reservationId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return { success: true, data: data.booking || data };
    } catch (error) {
      console.error('Error updating reservation fields:', error);
      return { success: false, error: error.message };
    }
  },

  // Manual checkout for a reservation (early or on time)
  async checkoutReservation(reservationId) {
    try {
      const response = await fetch(`http://localhost:4000/api/bookings/${encodeURIComponent(reservationId)}/checkout`, {
        method: 'POST'
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Error during checkout:', error);
      return { success: false, error: error.message };
    }
  },

  // Cancel reservation
  async cancelReservation(reservationId) {
    return this.updateReservationStatus(reservationId, 'cancelled');
  }
};

// ============================
// Payment functions
// ============================
export const paymentService = {
  // Create a new payment
  async createPayment(paymentData) {
    try {
      if (!paymentData.reservation_id) {
        throw new Error("Reservation ID is missing in paymentData");
      }

      // Use backend to perform insert with service key (avoids client RLS issues)
      const response = await fetch('http://localhost:4000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const payment = data.payment ? data.payment : data;
      return { success: true, data: payment };
    } catch (error) {
      console.error('Error creating payment:', error);
      return { success: false, error: error.message };
    }
  },

  // Get payments for a reservation
  async getPaymentsByReservation(reservationId) {
    try {
      const response = await fetch(`http://localhost:4000/api/payments/reservation/${encodeURIComponent(reservationId)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching payments:', error);
      return { success: false, error: error.message };
    }
  },

  // Update payment status
  async updatePaymentStatus(paymentId, status, additionalData = {}) {
    try {
      const updateData = { status, ...additionalData };
      if (status === 'refunded') {
        updateData.refunded_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', paymentId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error updating payment:', error);
      return { success: false, error: error.message };
    }
  },

  // Get payment by ID
  async getPaymentById(paymentId) {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching payment:', error);
      return { success: false, error: error.message };
    }
  },

  // Get user's payment history
  async getUserPayments(userId) {
    try {
      const { data, error } = await supabase
        .from('payment_details')
        .select('*')
        .eq('user_id', userId)
        .order('payment_created', { ascending: false });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching user payments:', error);
      return { success: false, error: error.message };
    }
  }
};

// ============================
// Combined booking service
// ============================
export const bookingService = {
  // Complete booking process (reservation + payment)
  async completeBooking(bookingData) {
    try {
      const { reservationData, paymentData } = bookingData;
      
      // Create reservation first
      const reservationResult = await reservationService.createReservation(reservationData);
      if (!reservationResult.success) {
        return reservationResult;
      }

      // ✅ Ensure reservation_id is set
      paymentData.reservation_id = reservationResult.data.id;

      // Create payment
      const paymentResult = await paymentService.createPayment(paymentData);
      if (!paymentResult.success) {
        // If payment fails, cancel the reservation
        await reservationService.cancelReservation(reservationResult.data.id);
        return paymentResult;
      }

      // Update reservation status to confirmed
      await reservationService.updateReservationStatus(reservationResult.data.id, 'confirmed');

      return {
        success: true,
        data: {
          reservation: reservationResult.data,
          payment: paymentResult.data
        }
      };
    } catch (error) {
      console.error('Error completing booking:', error);
      return { success: false, error: error.message };
    }
  },

  // Get booking details (reservation + payments)
  async getBookingDetails(reservationId) {
    try {
      const reservationResult = await reservationService.getReservationById(reservationId);
      if (!reservationResult.success) {
        return reservationResult;
      }

      const paymentsResult = await paymentService.getPaymentsByReservation(reservationId);
      if (!paymentsResult.success) {
        return paymentsResult;
      }

      return {
        success: true,
        data: {
          reservation: reservationResult.data,
          payments: paymentsResult.data
        }
      };
    } catch (error) {
      console.error('Error fetching booking details:', error);
      return { success: false, error: error.message };
    }
  }
};
