const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const port = process.env.PORT || 4000;

// Enhanced CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

// Serve local room images from the frontend folder
// Maps: http://localhost:4000/images/rooms/<filename>
//   ->  <repo-root>/front end/rooms/<filename>
app.use(
  '/images/rooms',
  express.static(path.join(__dirname, '..', 'front end', 'rooms'))
);

// Fallback Supabase configuration if env vars are missing (trim to avoid whitespace issues)
const supabaseUrl = (process.env.SUPABASE_URL || 'https://your-project.supabase.co').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_KEY || 'your-service-key').trim();

console.log('SUPABASE_URL:', supabaseUrl);
console.log('SUPABASE_SERVICE_KEY:', supabaseServiceKey ? 'Set' : 'Missing');

let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
} catch (error) {
  console.error('Failed to create Supabase client:', error.message);
  supabase = null;
}

// Schedule: periodically mark eligible confirmed + paid reservations as 'checked out'
// Runs every 5 minutes
setInterval(() => {
  runAutoCheckoutBatch().then((r) => {
    if (r && r.updated) {
      console.log(`[AutoCheckoutScheduler] Updated ${r.updated} reservation(s).`);
    }
  }).catch((e) => console.warn('[AutoCheckoutScheduler] error:', e));
}, 5 * 60 * 1000);

// Temporary in-memory storage for testing (remove when database is ready)
const tempUsers = new Map();

module.exports = { supabase };

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    supabase: supabase ? 'Connected' : 'Not configured'
  });

});

// Check room availability for a given date range
app.get('/api/availability', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  const { room_name, start, end } = req.query;
  if (!room_name || !start || !end) {
    return res.status(400).json({ error: 'Missing room_name, start, or end query parameters' });
  }
  try {
    const { data: roomRow, error: roomErr } = await supabase
      .from('rooms')
      .select('id, name, status, maintenance, available, occupied')
      .eq('name', room_name)
      .single();
    if (roomErr || !roomRow) {
      return res.status(404).json({ error: 'Room not found' });
    }
    // Treat capacity as total inventory for this room type (units): available + occupied
    const totalUnits = (Number(roomRow.available) || 0) + (Number(roomRow.occupied) || 0);
    const capacity = totalUnits > 0 ? totalUnits : 1;
    if (roomRow.maintenance === true || String(roomRow.status || '').toLowerCase() === 'maintenance') {
      return res.json({ room_name, capacity, reserved: capacity, available: 0, isAvailable: false });
    }

    const toLocalYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    };
    const startStr = toLocalYMD(new Date(start));
    const endStr = toLocalYMD(new Date(end));
    // Step 1: get overlapping, confirmed/completed reservations for this room
    const { data: overlaps, error: overlapErr } = await supabase
      .from('reservations')
      .select('id')
      .eq('room_name', room_name)
      .in('status', ['confirmed', 'completed'])
      .lt('check_in', endStr)
      .gt('check_out', startStr); // treat checkout day as available (exclusive)
    if (overlapErr) {
      return res.status(500).json({ error: overlapErr.message });
    }
    // Step 2: filter to only those with completed payments
    const ids = (overlaps || []).map(r => r.id);
    let reserved = 0;
    if (ids.length > 0) {
      const { data: pays, error: payErr } = await supabase
        .from('payments')
        .select('reservation_id')
        .in('reservation_id', ids)
        .eq('status', 'completed');
      if (payErr) {
        return res.status(500).json({ error: payErr.message });
      }
      const paidSet = new Set((pays || []).map(p => p.reservation_id));
      reserved = ids.filter(id => paidSet.has(id)).length;
    }
    const available = Math.max(0, capacity - reserved);
    return res.json({ room_name, capacity, reserved, available, isAvailable: available > 0 });
  } catch (e) {
    console.error('Availability error:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// List customers (profiles)
app.get('/api/customers', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  try {
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id, full_name, email, address, contact_number, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json(data || []);
  } catch (err) {
    console.error('Get customers error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Admin login (username + password, bcrypt)
app.post('/api/admin/login', async (req, res) => {
  const usernameRaw = (req.body && req.body.username) || '';
  const passwordRaw = (req.body && req.body.password) || '';
  const username = String(usernameRaw).trim();
  const password = String(passwordRaw);
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  try {
    console.log('[AdminLogin] Attempt for username:', username);
    const { data: admin, error } = await supabase
      .from('admin_profiles')
      .select('*')
      .ilike('username', username)
      .single();

    if (error || !admin) {
      if (error) console.warn('[AdminLogin] Query error:', error.message);
      else console.warn('[AdminLogin] Username not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let ok = false;
    const stored = admin.password || '';
    if (stored.startsWith('$2')) {
      // bcrypt hash
      ok = await bcrypt.compare(password, stored);
    } else {
      // fallback for dev data where password might be stored in plaintext
      ok = password === stored;
      if (ok) console.warn('[AdminLogin] WARNING: matched plaintext password for username:', username);
    }
    if (!ok) {
      console.warn('[AdminLogin] Password mismatch for username:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // You can replace this with a real JWT if needed (e.g., jsonwebtoken)
    const token = `admin-${admin.id}-${Date.now()}`;
    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: admin.id,
        username: admin.username,
        full_name: admin.full_name
      }
    });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Update booking fields (e.g., special_requests)
app.put('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }

  if (!id) {
    return res.status(400).json({ error: 'Booking ID is required' });
  }

  try {
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('reservations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ message: 'Booking updated successfully', booking: data });
  } catch (err) {
    console.error('Booking update error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Test endpoint
app.get('/api/bookings', async (req, res) => {
  const { data, error } = await supabase.from('reservations').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});


// User registration endpoint with bcrypt password hashing
app.post('/api/register', async (req, res) => {
  const { full_name, email, password } = req.body;
  
  console.log('Registration attempt:', { full_name, email, password: password ? '***' : 'missing' });
  
  if (!full_name || !email || !password) {
    console.log('Missing required fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('customer_profiles')
      .select('id')
      .eq('email', email)
      .single();
    
    if (existingUser) {
      console.log('User already exists:', email);
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const { data, error } = await supabase.from('customer_profiles').insert([
      { 
        full_name, 
        email, 
        password: hashedPassword,
        created_at: new Date().toISOString()
      }
    ]);
    
    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('User registered successfully:', email);
    res.status(201).json({ message: 'User registered successfully', user: { full_name, email } });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== PAYMENTS ENDPOINTS =====

// Create payment
app.post('/api/payments', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }

  const {
    reservation_id,
    amount,
    method,
    status = 'completed',
    payment_reference,
    transaction_id,
    currency = 'PHP',
    gateway_response = null
  } = req.body || {};

  if (!reservation_id || !amount || !method || !payment_reference) {
    return res.status(400).json({ error: 'Missing required fields: reservation_id, amount, method, payment_reference' });
  }

  try {
    // Optional: verify reservation exists
    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .select('id')
      .eq('id', reservation_id)
      .single();

    if (reservationError || !reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    // Normalize method lightly (trim/lower) and keep original for error handling
    const originalMethod = method;
    const normalizedMethod = typeof method === 'string' ? method.trim() : method;

    const payload = {
      reservation_id,
      amount,
      method: normalizedMethod,
      status,
      payment_reference,
      transaction_id: transaction_id || payment_reference,
      currency,
      gateway_response,
      created_at: new Date().toISOString()
    };

    // Attempt insert, and if method check constraint fails, retry with alternative e-wallet spelling
    let { data: payment, error } = await supabase
      .from('payments')
      .insert([payload])
      .select()
      .single();

    if (error && typeof error.message === 'string' && error.message.includes('payments_method_allowed_chk')) {
      // Try common e-wallet variants until one passes the DB check constraint
      const base = String(originalMethod || '');
      const variants = [
        base,
        base.toLowerCase(),
        base.toUpperCase(),
        // Common wallet brand variants
        'gcash',
        'GCash',
        'Gcash',
        'G-Cash',
        'e-wallet',
        'e_wallet',
        'E-Wallet',
        'E‑Wallet',
        'E Wallet',
        'ewallet'
      ];
      for (const v of variants) {
        const retryPayload = { ...payload, method: v };
        const retry = await supabase
          .from('payments')
          .insert([retryPayload])
          .select()
          .single();
        if (!retry.error) {
          payment = retry.data;
          error = null;
          break;
        }
      }
    }

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Do not auto-confirm on payment; admin must confirm explicitly via PUT /api/bookings/:id/status

    return res.status(201).json({ message: 'Payment created successfully', payment });
  } catch (err) {
    console.error('Payment creation error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Get payments by reservation id
app.get('/api/payments/reservation/:id', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('reservation_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(data || []);
  } catch (err) {
    console.error('Get payments error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// User login endpoint with bcrypt password check
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  console.log('Login attempt:', { email, password: password ? '***' : 'missing' });
  
  if (!email || !password) {
    console.log('Missing required fields for login');
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (!supabase) {
    console.log('Supabase client not available for login');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    // Find user by email
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error) {
      console.error('Supabase error during login:', error);
      return res.status(401).json({ error: 'Invalid login credentials' });
    }
    
    if (!data) {
      console.log('User not found:', email);
      return res.status(401).json({ error: 'Invalid login credentials' });
    }
    
    // Compare password
    const match = await bcrypt.compare(password, data.password);
    if (!match) {
      console.log('Password mismatch for:', email);
      return res.status(401).json({ error: 'Invalid login credentials' });
    }
    
    console.log('Login successful for:', email);
    res.json({ 
      message: 'Login successful', 
      user: { 
        id: data.id, 
        full_name: data.full_name, 
        email: data.email 
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

  // Update user profile endpoint
  app.put('/api/profile/:id', async (req, res) => {
    const { id } = req.params;
    const { full_name, email, address, contact_number, gender, plate_no } = req.body;
    
    console.log('Profile update attempt:', { id, full_name, email, address, contact_number, gender, plate_no });
  
  if (!id) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    // Check if user exists by ID; if not, try by email (handles stale local IDs)
    let targetId = id;
    const { data: existingUser, error: checkError } = await supabase
      .from('customer_profiles')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existingUser) {
      console.warn('[ProfileUpdate] User not found by id:', id, 'Trying lookup by email...');
      if (email) {
        const { data: foundByEmail, error: emailLookupError } = await supabase
          .from('customer_profiles')
          .select('id')
          .eq('email', email)
          .single();
        if (foundByEmail && foundByEmail.id) {
          targetId = foundByEmail.id;
          console.warn('[ProfileUpdate] Using id from email lookup:', targetId);
        } else {
          console.log('User not found:', id, emailLookupError ? emailLookupError.message : '');
          return res.status(404).json({ error: 'User not found' });
        }
      } else {
        console.log('User not found and no email provided for fallback:', id);
        return res.status(404).json({ error: 'User not found' });
      }
    }
    
    // Check if email is being changed and if it's already taken by another user
    if (email) {
      const { data: emailCheck, error: emailError } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('email', email)
        .neq('id', targetId)
        .single();
      
      if (emailCheck) {
        console.log('Email already taken:', email);
        return res.status(400).json({ error: 'Email address is already in use by another account' });
      }
    }
    
    // Update user profile (do not set updated_at unless the column exists)
    const updateData = {};
    
    if (full_name) updateData.full_name = full_name;
    if (email) updateData.email = email;
    if (address !== undefined) updateData.address = address;
    if (contact_number !== undefined) updateData.contact_number = contact_number;
    if (gender !== undefined) updateData.gender = gender;
    if (plate_no !== undefined) updateData.plate_no = plate_no;
    
    const { data, error } = await supabase
      .from('customer_profiles')
      .update(updateData)
      .eq('id', targetId)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase error during profile update:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('Profile updated successfully for user:', targetId);
    res.json({ 
      message: 'Profile updated successfully', 
      user: {
        id: data.id,
        full_name: data.full_name,
        email: data.email,
        address: data.address,
        contact_number: data.contact_number,
        gender: data.gender,
        plate_no: data.plate_no,
        updated_at: data.updated_at
      }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Create booking endpoint (using reservations table)
app.post('/api/bookings', async (req, res) => {
  const { 
    user_name, 
    room_name, 
    check_in, 
    check_out, 
    guest_count, 
    total_amount, 
    special_requests,
    extra_beds,
    extra_persons,
    status = 'pending'
  } = req.body;
  
  console.log('Creating booking:', { user_name, room_name, check_in, check_out, guest_count, total_amount, extra_beds, extra_persons });
  
  if (!user_name || !room_name || !check_in || !check_out || !guest_count || !total_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    // Guard: prevent booking rooms that are under maintenance
    const { data: roomRow, error: roomLookupError } = await supabase
      .from('rooms')
      .select('id, name, status, maintenance, available, occupied')
      .eq('name', room_name)
      .single();

    if (roomLookupError || !roomRow) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (roomRow.maintenance === true || String(roomRow.status).toLowerCase() === 'maintenance') {
      return res.status(400).json({ error: 'This room is under maintenance and cannot be booked at the moment.' });
    }

    // Capacity guard: block if overlapping reservations already meet or exceed available count
    const startStr = new Date(check_in).toISOString().split('T')[0];
    const endStr = new Date(check_out).toISOString().split('T')[0];
    // Capacity is total inventory (units) for this room type
    const totalUnits = (Number(roomRow.available) || 0) + (Number(roomRow.occupied) || 0);
    const capacity = totalUnits > 0 ? totalUnits : 1;
    try {
      // Count blocking reservations:
      // - confirmed/completed always block
      // - pending only blocks if created within the last 10 minutes (temporary hold)
      // - pending belonging to the same user does NOT block re-attempts
      const holdMs = 10 * 60 * 1000;
      const nowTs = Date.now();

      const { data: overlaps, error: overlapErr } = await supabase
        .from('reservations')
        .select('id, user_name, status, check_in, check_out, created_at')
        .eq('room_name', room_name)
        .in('status', ['pending', 'confirmed', 'completed'])
        .lt('check_in', endStr)   // existing starts before new ends
        .gt('check_out', startStr); // existing ends after new starts
      if (overlapErr) {
        console.warn('[Capacity] overlap check error:', overlapErr.message);
      } else {
        const list = Array.isArray(overlaps) ? overlaps : [];
        const blocking = list.filter(r => {
          const s = String(r.status || '').toLowerCase();
          if (s === 'confirmed' || s === 'completed') return true;
          if (s === 'pending') {
            // Do not block the same user's own pending when re-attempting
            if (String(r.user_name || '') === String(user_name || '')) return false;
            const created = r.created_at ? new Date(r.created_at).getTime() : 0;
            return created && (nowTs - created) <= holdMs; // only count fresh holds
          }
          return false;
        });
        if (blocking.length >= capacity) {
          return res.status(400).json({ error: 'Fully booked for the selected dates. Please choose different dates or another room.' });
        }
      }
    } catch (e) {
      console.warn('[Capacity] exception during overlap check:', e);
    }

    // Create reservation
    const { data: booking, error: bookingError } = await supabase
      .from('reservations')
      .insert([{
        user_name,
        room_name,
        // Use local YYYY-MM-DD to avoid timezone shifting the stored date
        check_in: (() => { const d = new Date(check_in); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })(),
        check_out: (() => { const d = new Date(check_out); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; })(),
        guest_count,
        total_amount,
        special_requests: special_requests || '',
        // Optional extras (columns should exist in DB to be stored)
        ...(extra_beds !== undefined ? { extra_beds: Number(extra_beds) || 0 } : {}),
        ...(extra_persons !== undefined ? { extra_persons: Number(extra_persons) || 0 } : {}),
        status,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (bookingError) {
      console.error('Error creating booking:', bookingError);
      return res.status(500).json({ error: bookingError.message });
    }
    
    console.log('Booking created successfully:', booking.id);
    res.status(201).json({ 
      message: 'Booking created successfully', 
      booking: {
        ...booking,
        room_name: room_name
      }
    });
  } catch (err) {
    console.error('Booking creation error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Get all bookings for admin
app.get('/api/bookings', async (req, res) => {
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    const { data: bookings, error } = await supabase
      .from('reservations')
      .select(`
        *,
        payments (
          id,
          amount,
          method,
          status,
          payment_reference,
          created_at
        )
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching bookings:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(bookings);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Get customer bookings
app.get('/api/bookings/customer/:customerId', async (req, res) => {
  const { customerId } = req.params;
  
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    const { data: bookings, error } = await supabase
      .from('reservations')
      .select(`
        *,
        payments (
          id,
          amount,
          method,
          status,
          payment_reference,
          created_at
        )
      `)
      .eq('user_name', customerId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching customer bookings:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(bookings);
  } catch (err) {
    console.error('Error fetching customer bookings:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Update booking status
app.put('/api/bookings/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    // Guard: prevent cancelling after 20 minutes from creation; allow for pending or confirmed
    if (String(status).toLowerCase() === 'cancelled') {
      const { data: existing, error: fetchErr } = await supabase
        .from('reservations')
        .select('id, status, created_at')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) {
        return res.status(500).json({ error: fetchErr.message });
      }
      if (!existing) {
        return res.status(404).json({ error: 'Reservation not found' });
      }
      const currentStatus = String(existing.status || '').toLowerCase();
      if (!['pending','confirmed'].includes(currentStatus)) {
        return res.status(400).json({ error: 'Only pending or confirmed reservations can be cancelled' });
      }
      const createdTs = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      const nowTs = Date.now();
      const twentyMinutesMs = 20 * 60 * 1000;
      if (!createdTs || nowTs - createdTs > twentyMinutesMs) {
        return res.status(400).json({ error: 'Cancellation window expired (20 minutes after booking)' });
      }
    }

    const { data: booking, error } = await supabase
      .from('reservations')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating booking status:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ message: 'Booking status updated successfully', booking });
  } catch (err) {
    console.error('Error updating booking status:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== CHECKOUT UTILITIES & ENDPOINTS =====
// Helper to compute local YYYY-MM-DD string in Asia/Manila for date-only comparisons
const toLocalYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

// Batch auto-checkout for reservations whose check_out date has passed (local date)
async function runAutoCheckoutBatch() {
  if (!supabase) {
    console.log('[AutoCheckout] Skipped: Supabase not configured');
    return { updated: 0 };
  }
  try {
    const now = new Date();
    const todayStr = toLocalYMD(now);
    // Select confirmed, paid reservations with check_out < today (exclusive checkout day)
    const { data: due, error: dueErr } = await supabase
      .from('reservations')
      .select('id')
      .in('status', ['confirmed'])
      .lt('check_out', todayStr);
    if (dueErr) {
      console.warn('[AutoCheckout] query error:', dueErr.message);
      return { updated: 0, error: dueErr.message };
    }
    const ids = (due || []).map(r => r.id);
    if (!ids.length) return { updated: 0 };

    // Filter to only those with completed payments
    const { data: pays, error: payErr } = await supabase
      .from('payments')
      .select('reservation_id')
      .in('reservation_id', ids)
      .eq('status', 'completed');
    if (payErr) {
      console.warn('[AutoCheckout] payments error:', payErr.message);
      return { updated: 0, error: payErr.message };
    }
    const paidSet = new Set((pays || []).map(p => p.reservation_id));
    const targetIds = ids.filter(id => paidSet.has(id));
    if (!targetIds.length) return { updated: 0 };

    const { data: updatedRows, error: updErr } = await supabase
      .from('reservations')
      .update({ status: 'checked out', updated_at: new Date().toISOString() })
      .in('id', targetIds)
      .select('id');
    if (updErr) {
      console.warn('[AutoCheckout] update error:', updErr.message);
      return { updated: 0, error: updErr.message };
    }
    const count = (updatedRows || []).length;
    console.log(`[AutoCheckout] Marked ${count} reservation(s) as checked out`);
    return { updated: count };
  } catch (e) {
    console.warn('[AutoCheckout] exception:', e);
    return { updated: 0, error: e.message };
  }
}

// Manual checkout for a specific reservation (idempotent)
app.post('/api/bookings/:id/checkout', async (req, res) => {
  const { id } = req.params;
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  try {
    // Fetch reservation & confirm eligibility
    const { data: r, error: rErr } = await supabase
      .from('reservations')
      .select('id, status, check_in, check_out')
      .eq('id', id)
      .maybeSingle();
    if (rErr) return res.status(500).json({ error: rErr.message });
    if (!r) return res.status(404).json({ error: 'Reservation not found' });

    const status = String(r.status || '').toLowerCase();
    if (status === 'checked out') {
      return res.json({ message: 'Already checked out', booking: r });
    }
    if (status !== 'confirmed') {
      return res.status(400).json({ error: 'Only confirmed reservations can be checked out' });
    }

    // Optional: ensure payment exists
    const { data: pays } = await supabase
      .from('payments')
      .select('id')
      .eq('reservation_id', id)
      .eq('status', 'completed')
      .limit(1);
    if (!Array.isArray(pays) || pays.length === 0) {
      return res.status(400).json({ error: 'Cannot check out: no completed payment found' });
    }

    const { data: booking, error: updErr } = await supabase
      .from('reservations')
      .update({ status: 'checked out', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (updErr) return res.status(500).json({ error: updErr.message });
    return res.json({ message: 'Checked out successfully', booking });
  } catch (e) {
    console.error('[ManualCheckout] error:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Trigger auto-checkout batch on-demand
app.post('/api/bookings/auto-checkout', async (req, res) => {
  const result = await runAutoCheckoutBatch();
  if (result.error) return res.status(500).json(result);
  return res.json(result);
});

// Maintenance: normalize reservation statuses to resolve inconsistencies
// - If a reservation has a completed payment but status is 'cancelled', set to 'pending'
// - If a reservation is 'confirmed' with completed payment and past checkout, set to 'checked out'
app.post('/api/maintenance/normalize-reservations', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  try {
    const todayStr = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    })();

    // Find reservations that have completed payment
    const { data: pays, error: payErr } = await supabase
      .from('payments')
      .select('reservation_id')
      .eq('status', 'completed');
    if (payErr) return res.status(500).json({ error: payErr.message });
    const paidSet = new Set((pays || []).map(p => p.reservation_id));

    let fixedCancelledToPending = 0;
    let fixedAutoCheckedOut = 0;

    // Load potentially inconsistent reservations
    const { data: suspect, error: susErr } = await supabase
      .from('reservations')
      .select('id, status, check_out')
      .in('status', ['cancelled', 'confirmed']);
    if (susErr) return res.status(500).json({ error: susErr.message });

    const toPending = [];
    const toCheckedOut = [];
    (suspect || []).forEach(r => {
      const hasPay = paidSet.has(r.id);
      const st = String(r.status || '').toLowerCase();
      if (st === 'cancelled' && hasPay) {
        toPending.push(r.id);
      }
      if (st === 'confirmed' && hasPay && r.check_out && r.check_out < todayStr) {
        toCheckedOut.push(r.id);
      }
    });

    if (toPending.length) {
      const { data: upd1, error: upd1Err } = await supabase
        .from('reservations')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .in('id', toPending)
        .select('id');
      if (upd1Err) return res.status(500).json({ error: upd1Err.message });
      fixedCancelledToPending = (upd1 || []).length;
    }

    if (toCheckedOut.length) {
      const { data: upd2, error: upd2Err } = await supabase
        .from('reservations')
        .update({ status: 'checked out', updated_at: new Date().toISOString() })
        .in('id', toCheckedOut)
        .select('id');
      if (upd2Err) return res.status(500).json({ error: upd2Err.message });
      fixedAutoCheckedOut = (upd2 || []).length;
    }

    return res.json({ fixedCancelledToPending, fixedAutoCheckedOut });
  } catch (e) {
    console.error('[NormalizeReservations] error:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ===== DASHBOARD STATISTICS ENDPOINTS =====

// Get dashboard statistics
app.get('/api/dashboard/stats', async (req, res) => {
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    const today = new Date();
    const toLocalYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    };
    const todayStr = toLocalYMD(today);
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const yesterdayStr = toLocalYMD(yesterday);
    const tomorrowStr = toLocalYMD(tomorrow);

    // Helper: get paid reservation IDs from a list of reservation IDs
    const getPaidSet = async (ids) => {
      if (!ids || ids.length === 0) return new Set();
      const { data: pays, error: payErr } = await supabase
        .from('payments')
        .select('reservation_id')
        .in('reservation_id', ids)
        .eq('status', 'completed');
      if (payErr) {
        console.warn('[DashboardStats] payments fetch error:', payErr.message);
        return new Set();
      }
      return new Set((pays || []).map(p => p.reservation_id));
    };

    // Today check-ins (confirmed+paid)
    const { data: tCheckInsRaw } = await supabase
      .from('reservations')
      .select('id')
      .eq('check_in', todayStr)
      .in('status', ['confirmed','completed']);
    const tPaidIn = await getPaidSet((tCheckInsRaw || []).map(r => r.id));
    const todayCheckInsCount = (tCheckInsRaw || []).filter(r => tPaidIn.has(r.id)).length;

    // Yesterday check-ins (for delta)
    const { data: yCheckInsRaw } = await supabase
      .from('reservations')
      .select('id')
      .eq('check_in', yesterdayStr)
      .in('status', ['confirmed','completed']);
    const yPaidIn = await getPaidSet((yCheckInsRaw || []).map(r => r.id));
    const yesterdayCheckInsCount = (yCheckInsRaw || []).filter(r => yPaidIn.has(r.id)).length;

    // Today check-outs (confirmed+paid)
    const { data: tCheckOutsRaw } = await supabase
      .from('reservations')
      .select('id')
      .eq('check_out', todayStr)
      .in('status', ['confirmed','completed']);
    const tPaidOut = await getPaidSet((tCheckOutsRaw || []).map(r => r.id));
    const todayCheckOutsCount = (tCheckOutsRaw || []).filter(r => tPaidOut.has(r.id)).length;

    // Yesterday check-outs (for delta)
    const { data: yCheckOutsRaw } = await supabase
      .from('reservations')
      .select('id')
      .eq('check_out', yesterdayStr)
      .in('status', ['confirmed','completed']);
    const yPaidOut = await getPaidSet((yCheckOutsRaw || []).map(r => r.id));
    const yesterdayCheckOutsCount = (yCheckOutsRaw || []).filter(r => yPaidOut.has(r.id)).length;

    // Rooms list for totals
    const { data: rooms } = await supabase
      .from('rooms')
      .select('name, available, occupied');

    // Today's overlaps (confirmed+paid) to compute occupied/available per room
    const { data: overlaps } = await supabase
      .from('reservations')
      .select('id, room_name')
      .in('status', ['confirmed','completed'])
      .lt('check_in', tomorrowStr)
      .gt('check_out', todayStr);
    const paidTodaySet = await getPaidSet((overlaps || []).map(r => r.id));
    const reservedMap = {};
    (overlaps || []).forEach(r => {
      if (paidTodaySet.has(r.id)) {
        reservedMap[r.room_name] = (reservedMap[r.room_name] || 0) + 1;
      }
    });

    let totalUnitsAll = 0;
    let reservedTodayAll = 0;
    if (Array.isArray(rooms)) {
      rooms.forEach(room => {
        const totalUnits = (Number(room.available) || 0) + (Number(room.occupied) || 0);
        totalUnitsAll += totalUnits;
        reservedTodayAll += (reservedMap[room.name] || 0);
      });
    }
    const totalAvailableRooms = Math.max(0, totalUnitsAll - reservedTodayAll);
    const totalOccupiedRooms = reservedTodayAll;

    // Total revenue from completed payments (all time)
    const { data: paidPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'completed');
    const totalRevenue = (paidPayments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const checkInChange = todayCheckInsCount - yesterdayCheckInsCount;
    const checkOutChange = todayCheckOutsCount - yesterdayCheckOutsCount;

    // Counts per report definitions
    // pending: admin not yet approved (status = 'pending')
    // confirmed: approved by admin (status = 'confirmed')
    // checkedOut: manually by admin or auto when stay ends (status = 'checked out')
    const { data: pendingRows } = await supabase
      .from('reservations')
      .select('id')
      .eq('status', 'pending');
    const { data: confirmedRows } = await supabase
      .from('reservations')
      .select('id')
      .eq('status', 'confirmed');
    const { data: checkedOutRows } = await supabase
      .from('reservations')
      .select('id')
      .eq('status', 'checked out');

    const stats = {
      todayCheckIns: todayCheckInsCount,
      todayCheckOuts: todayCheckOutsCount,
      totalAvailableRooms,
      totalOccupiedRooms,
      totalRevenue,
      checkInChange: checkInChange >= 0 ? `+${checkInChange}` : `${checkInChange}`,
      checkOutChange: checkOutChange >= 0 ? `+${checkOutChange}` : `${checkOutChange}`,
      availableChange: '0',
      occupiedChange: '0',
      pending: Array.isArray(pendingRows) ? pendingRows.length : 0,
      confirmed: Array.isArray(confirmedRows) ? confirmedRows.length : 0,
      checkedOut: Array.isArray(checkedOutRows) ? checkedOutRows.length : 0
    };

    res.json(stats);
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Get dashboard rooms preview (limited rooms for dashboard display)
app.get('/api/dashboard/rooms', async (req, res) => {
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    const lim = Number(req.query.limit);
    let query = supabase
      .from('rooms')
      .select('id, name, price, capacity, images, available, occupied, features, status')
      .order('created_at', { ascending: false });
    if (!Number.isNaN(lim) && lim > 0) {
      query = query.limit(lim);
    }
    const { data: rooms, error } = await query;
    
    if (error) {
      console.error('Error fetching dashboard rooms:', error);
      return res.status(500).json({ error: error.message });
    }
    
    // Compute today's overlapping reservations per room to show current occupancy like "1/3 occupied"
    const today = new Date();
    const todayStr = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().split('T')[0];
    const tomorrow = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1));
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: overlaps, error: resErr } = await supabase
      .from('reservations')
      .select('id, room_name')
      .eq('status', 'confirmed')
      .lt('check_in', tomorrowStr)  // started before tomorrow
      .gte('check_out', todayStr);   // inclusive: still counted on checkout day

    if (resErr) {
      console.warn('[DashboardRooms] reservation overlap fetch error:', resErr.message);
    }

    const reservedMap = {};
    let paidSet = new Set();
    const ids = (overlaps || []).map(r => r.id);
    if (ids.length > 0) {
      const { data: pays, error: payErr } = await supabase
        .from('payments')
        .select('reservation_id, status')
        .in('reservation_id', ids)
        .eq('status', 'completed');
      if (payErr) {
        console.warn('[DashboardRooms] payments fetch error:', payErr.message);
      } else {
        paidSet = new Set((pays || []).map(p => p.reservation_id));
      }
    }
    (overlaps || []).forEach(r => {
      if (paidSet.has(r.id)) {
        reservedMap[r.room_name] = (reservedMap[r.room_name] || 0) + 1;
      }
    });

    // Format rooms for dashboard display
    const formattedRooms = rooms.map(room => {
      const totalUnits = (room.available || 0) + (room.occupied || 0);
      const reservedToday = reservedMap[room.name] || 0;
      const remainingToday = Math.max(0, totalUnits - reservedToday);
      return {
        id: room.id,
        name: room.name,
        price: room.price,
        capacity: room.capacity,
        images: room.images || [],
        // Display as "reserved/total" for today (e.g., 1/1 occupied)
        occupied: `${reservedToday}/${totalUnits}`,
        availableToday: remainingToday,
        totalUnits,
        reservedToday,
        amenities: (room.features || []).slice(0, 3), // Show first 3 amenities
        status: room.status
      };
    });
    
    res.json(formattedRooms);
  } catch (err) {
    console.error('Dashboard rooms error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== ROOM MANAGEMENT ENDPOINTS =====

// Get all rooms
app.get('/api/rooms', async (req, res) => {
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching rooms:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(rooms);
  } catch (err) {
    console.error('Error fetching rooms:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Create new room
app.post('/api/rooms', async (req, res) => {
  const { 
    name, 
    beds, 
    capacity, 
    price, 
    available, 
    occupied, 
    reserved, 
    maintenance, 
    features, 
    images,
    status = 'available'
  } = req.body;
  
  console.log('Creating room:', { name, beds, capacity, price, available, occupied, reserved, maintenance, features, images, status });
  
  if (!name || !capacity || !price) {
    return res.status(400).json({ error: 'Missing required fields: name, capacity, and price are required' });
  }
  
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    const roomData = {
      name,
      beds: beds || '',
      capacity: parseInt(capacity),
      price: parseFloat(price),
      available: parseInt(available) || 0,
      occupied: parseInt(occupied) || 0,
      reserved: parseInt(reserved) || 0,
      maintenance: maintenance || false,
      features: features || [],
      images: images || [],
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: room, error } = await supabase
      .from('rooms')
      .insert([roomData])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating room:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('Room created successfully:', room.id);
    res.status(201).json({ 
      message: 'Room created successfully', 
      room 
    });
  } catch (err) {
    console.error('Room creation error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Update room
app.put('/api/rooms/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    name, 
    beds, 
    capacity, 
    price, 
    available, 
    occupied, 
    reserved, 
    maintenance, 
    features, 
    images,
    status
  } = req.body;
  
  console.log('Updating room:', { id, name, beds, capacity, price, available, occupied, reserved, maintenance, features, images, status });
  
  if (!id) {
    return res.status(400).json({ error: 'Room ID is required' });
  }
  
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    // Check if room exists
    const { data: existingRoom, error: checkError } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', id)
      .single();
    
    if (checkError || !existingRoom) {
      console.log('Room not found:', id);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Prepare update data
    const updateData = {
      updated_at: new Date().toISOString()
    };
    
    if (name !== undefined) updateData.name = name;
    if (beds !== undefined) updateData.beds = beds;
    if (capacity !== undefined) updateData.capacity = parseInt(capacity);
    if (price !== undefined) updateData.price = parseFloat(price);
    if (available !== undefined) updateData.available = parseInt(available);
    if (occupied !== undefined) updateData.occupied = parseInt(occupied);
    if (reserved !== undefined) updateData.reserved = parseInt(reserved);
    if (maintenance !== undefined) updateData.maintenance = maintenance;
    if (features !== undefined) updateData.features = features;
    if (images !== undefined) updateData.images = images;
    if (status !== undefined) updateData.status = status;
    
    const { data: room, error } = await supabase
      .from('rooms')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating room:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('Room updated successfully:', room.id);
    res.json({ 
      message: 'Room updated successfully', 
      room 
    });
  } catch (err) {
    console.error('Room update error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Delete room
app.delete('/api/rooms/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log('Deleting room:', { id });
  
  if (!id) {
    return res.status(400).json({ error: 'Room ID is required' });
  }
  
  if (!supabase) {
    console.log('Supabase client not available');
    return res.status(500).json({ error: 'Database not configured. Please check environment variables.' });
  }
  
  try {
    // Check if room exists
    const { data: existingRoom, error: checkError } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', id)
      .single();
    
    if (checkError || !existingRoom) {
      console.log('Room not found:', id);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const { data: room, error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error deleting room:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('Room deleted successfully:', id);
    res.json({ 
      message: 'Room deleted successfully', 
      room
    });
  } catch (err) {
    console.error('Room delete error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ===== SCHEDULERS =====
// Run auto-checkout once at startup and then hourly
try {
  runAutoCheckoutBatch().catch(() => {});
  setInterval(() => {
    runAutoCheckoutBatch().catch((e) => console.warn('[AutoCheckout] interval error:', e?.message || e));
  }, 60 * 60 * 1000);
} catch (_) { /* noop */ }

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});