import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import './Bookings.css';

function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      // Attempt join to customer_profiles via customer_id
      let resp = await supabase
        .from('reservations')
        .select(`
          id,
          user_name,
          room_name,
          check_in,
          check_out,
          status,
          guest_count,
          total_amount,
          special_requests,
          created_at,
          updated_at,
          customer:customer_id (
            full_name,
            contact_number
          ),
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

      // If any error occurs (missing relationship, RLS, etc), fallback to simple select
      if (resp.error) {
        console.warn('[Bookings] join select failed, falling back:', resp.error?.message || resp.error);
        resp = await supabase
          .from('reservations')
          .select(`
            id,
            user_name,
            room_name,
            check_in,
            check_out,
            status,
            guest_count,
            total_amount,
            special_requests,
            created_at,
            updated_at,
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
      }

      if (resp.error) throw resp.error;
      let data = resp.data || [];

      // Optional enrichment: try to lookup customer_profiles by full_name if join was unavailable
      const needsEnrich = data.length > 0 && !data.some(r => r.customer);
      if (needsEnrich) {
        try {
          const prof = await supabase
            .from('customer_profiles')
            .select('full_name, contact_number');
          if (!prof.error && Array.isArray(prof.data)) {
            const byName = new Map(
              prof.data
                .filter(p => p.full_name)
                .map(p => [p.full_name.toString().trim().toLowerCase(), p])
            );
            data = data.map(r => {
              const key = (r.user_name || '').toString().trim().toLowerCase();
              return { ...r, customer: byName.get(key) || null };
            });
          }
        } catch (e) {
          // ignore enrichment failures
        }
      }

      // Show only bookings that have at least one payment
      const paidOnly = (data || []).filter(b => Array.isArray(b.payments) ? b.payments.length > 0 : false);
      setBookings(paidOnly);
      setError('');
    } catch (err) {
      const msg = err?.message || 'Failed to load bookings';
      setError(msg);
      console.error('Error fetching bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateBookingStatus = async (bookingId, newStatus) => {
    try {
      if (newStatus === 'checked out') {
        // Use backend manual checkout endpoint to ensure validations
        const res = await fetch(`http://localhost:4000/api/bookings/${encodeURIComponent(bookingId)}/checkout`, {
          method: 'POST'
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
      } else {
        // Fallback: update status directly (existing behavior)
        const { error } = await supabase
          .from('reservations')
          .update({ status: newStatus })
          .eq('id', bookingId);
        if (error) throw error;
      }
      // Update local state
      setBookings(prev => 
        prev.map(booking => 
          booking.id === bookingId 
            ? { ...booking, status: newStatus }
            : booking
        )
      );
    } catch (err) {
      console.error('Error updating booking status:', err);
      alert('Failed to update booking status: ' + (err?.message || ''));
    }
  };

  // Removed unused style helpers after CSS refactor

  // Format date (no time); fixed times shown separately
  const formatDateOnly = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const calculateNights = (checkIn, checkOut) => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  };

  // Parse extras from special_requests and compute charges
  const getExtrasInfo = (booking) => {
    try {
      const sr = String(booking.special_requests || '');
      const bedMatch = sr.match(/Extra\s*beds\s*:\s*(\d+)/i);
      const personMatch = sr.match(/Extra\s*persons?\s*:\s*(\d+)/i);
      const bedCount = bedMatch ? Math.max(0, parseInt(bedMatch[1], 10) || 0) : 0;
      const personCount = personMatch ? Math.max(0, parseInt(personMatch[1], 10) || 0) : 0;
      const nights = calculateNights(booking.check_in, booking.check_out);
      const bedsTotal = bedCount * 300 * nights;
      const personsTotal = personCount * 300 * nights;
      const extraTotal = bedsTotal + personsTotal;
      return { bedCount, personCount, nights, bedsTotal, personsTotal, extraTotal };
    } catch {
      return { bedCount: 0, personCount: 0, nights: 0, bedsTotal: 0, personsTotal: 0, extraTotal: 0 };
    }
  };

  const filteredBookings = bookings.filter(booking => {
    const matchesFilter = filter === 'all' || booking.status === filter;
    const matchesSearch = 
      (booking.room_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (booking.user_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (booking.special_requests || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="bookings-page">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bookings-page">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bookings-page">
      <div className="bookings-header">
        <h1 className="bookings-title">Bookings Management</h1>
        <p className="bookings-subtitle">Manage hotel reservations and payments</p>
      </div>

      {/* Filters and Search */}
      <div className="filters-card">
        <div className="filters-row">
          <div className="flex-1">
            <label className="form-label">Search Bookings</label>
            <input
              type="text"
              placeholder="Search by room, guest name/email, or status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-text"
            />
          </div>
          <div>
            <label className="form-label">Filter by Status</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input-select"
            >
              <option value="all">All Bookings</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="checked out">Checked Out</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bookings List */}
      <div className="bookings-card">
        {filteredBookings.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-300 text-lg">No bookings found</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead className="thead">
                <tr>
                  <th className="th w-32">
                    Booking ID
                  </th>
                  <th className="th w-36">
                    Room
                  </th>
                  <th className="th w-48">
                    Guest Info
                  </th>
                  <th className="th w-64">
                    Dates
                  </th>
                  <th className="th w-28">
                    Amount
                  </th>
                  <th className="th w-36">
                    Extras
                  </th>
                  <th className="th w-40">
                    Payment
                  </th>
                  <th className="th w-64">
                    Special Requests
                  </th>
                  <th className="th w-28">
                    Status
                  </th>
                  <th className="th w-36">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="tbody">
                {filteredBookings.map((booking) => (
                  <tr key={booking.id} className="tr">
                    <td className="td font-mono w-32">
                      {booking.id.slice(0, 8)}...
                    </td>
                    <td className="td w-36">
                      {booking.room_name}
                    </td>
                    <td className="td w-48">
                      <div>
                        <div className="font-medium text-slate-100">Guest: {booking.customer?.full_name || booking.user_name}</div>
                        <div className="text-slate-300">Contact: {booking.customer?.contact_number || '—'}</div>
                        <div className="text-slate-400">{booking.guest_count} guest{booking.guest_count !== 1 ? 's' : ''}</div>
                      </div>
                    </td>
                    <td className="td w-64">
                      <div>
                        <div>Check-in: {formatDateOnly(booking.check_in)}, 2:00 PM</div>
                        <div>Check-out: {formatDateOnly(booking.check_out)}, 12NN</div>
                        <div className="text-slate-400">
                          {calculateNights(booking.check_in, booking.check_out)} nights
                        </div>
                      </div>
                    </td>
                    <td className="td w-28">
                      <div className="font-semibold">₱{booking.total_amount.toLocaleString()}</div>
                    </td>
                    <td className="td w-36">
                      {(() => {
                        const extra = getExtrasInfo(booking);
                        const hasAny = (extra.bedCount > 0) || (extra.personCount > 0);
                        return hasAny ? (
                          <div>
                            {extra.bedCount > 0 && (
                              <div>
                                <div className="font-medium">Extra Beds: {extra.bedCount}</div>
                                <div className="text-slate-400 text-xs">₱300 × {extra.nights} night{extra.nights !== 1 ? 's' : ''} = ₱{extra.bedsTotal.toLocaleString()}</div>
                              </div>
                            )}
                            {extra.personCount > 0 && (
                              <div className="mt-1">
                                <div className="font-medium">Extra Persons: {extra.personCount}</div>
                                <div className="text-slate-400 text-xs">₱300 × {extra.nights} night{extra.nights !== 1 ? 's' : ''} = ₱{extra.personsTotal.toLocaleString()}</div>
                              </div>
                            )}
                            <div className="text-slate-300 text-xs mt-1">Total Extras: ₱{extra.extraTotal.toLocaleString()}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        );
                      })()}
                    </td>
                    <td className="td w-40">
                      {booking.payments && booking.payments.length > 0 ? (
                        <div>
                          <div className={`badge ${
                            booking.payments[0].status === 'completed' ? 'badge-confirmed' :
                            booking.payments[0].status === 'pending' ? 'badge-pending' :
                            booking.payments[0].status === 'failed' ? 'badge-cancelled' :
                            booking.payments[0].status === 'refunded' ? 'badge-completed' : ''
                          }`}>
                            {booking.payments[0].status}
                          </div>
                          <div className="text-slate-400 text-xs mt-1">
                            {booking.payments[0].method}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">No payment</span>
                      )}
                    </td>
                    <td className="td w-64" title={booking.special_requests || ''}>
                      {booking.special_requests || '—'}
                    </td>
                    <td className="td w-28">
                      <span className={`badge ${
                        booking.status === 'confirmed' ? 'badge-confirmed' :
                        booking.status === 'pending' ? 'badge-pending' :
                        booking.status === 'cancelled' ? 'badge-cancelled' :
                        booking.status === 'checked out' ? 'badge-completed' :
                        booking.status === 'rejected' ? 'badge-rejected' : ''
                      }`}>
                        {booking.status === 'pending' ? '⏳' : booking.status === 'confirmed' ? '📅' : booking.status === 'checked out' ? '✅' : (booking.status === 'cancelled' || booking.status === 'rejected') ? '❌' : ''} {booking.status}
                      </span>
                    </td>
                    <td className="td w-36">
                      <div className="actions">
                        {booking.status === 'pending' && (
                          <>
                            <button className="btn btn-accept" onClick={() => updateBookingStatus(booking.id, 'confirmed')}>
                              Accept
                            </button>
                            <button className="btn btn-reject" onClick={() => updateBookingStatus(booking.id, 'rejected')}>
                              Reject
                            </button>
                          </>
                        )}
                        {booking.status === 'confirmed' && (
                          <button className="btn btn-complete" onClick={() => updateBookingStatus(booking.id, 'checked out')}>
                            Check Out
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-value">{bookings.length}</div>
          <div className="summary-label">Total Bookings</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">
            {bookings.filter(b => b.status === 'pending').length}
          </div>
          <div className="summary-label">Pending</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">
            {bookings.filter(b => b.status === 'confirmed').length}
          </div>
          <div className="summary-label">Confirmed</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">
            ₱{bookings.reduce((sum, b) => sum + b.total_amount, 0).toLocaleString()}
          </div>
          <div className="summary-label">Total Revenue</div>
        </div>
      </div>
    </div>
  );
}

export default Bookings; 