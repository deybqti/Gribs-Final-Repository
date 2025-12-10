import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { reservationService } from "../services/database";
import "./Bookings.css";

const Bookings = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now()); // tick for countdown

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const user = JSON.parse(localStorage.getItem("user"));
        if (!user) {
          navigate("/login");
          return;
        }

        // Use full_name if available, fallback to email or id
        const userName = user.full_name || user.email || user.id;
        const result = await reservationService.getUserReservations(userName);

        if (result.success) {
          const allBookings = result.data || [];

          // ✅ If backend provides `payments`, filter only paid bookings
          // Otherwise, show all bookings
          const normalized = allBookings.filter(
            (b) =>
              !("payments" in b) || // show if payments not part of response
              (Array.isArray(b.payments) && b.payments.length > 0)
          );

          setBookings(normalized);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError("Failed to load bookings");
        console.error("Error fetching bookings:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [navigate]);

  // Tick every second to update countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case "confirmed":
        return "#10b981";
      case "pending":
        return "#f59e0b";
      case "cancelled":
        return "#ef4444";
      case "rejected":
        return "#ef4444";
      case "checked out":
        return "#6b7280";
      default:
        return "#6b7280";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "confirmed":
        return "📅";
      case "pending":
        return "⏳";
      case "cancelled":
      case "rejected":
        return "❌";
      case "checked out":
        return "✅";
      default:
        return "";
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
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

  const formatPHT = (iso) => {
    try {
      return new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch (_) {
      return new Date(iso).toLocaleString();
    }
  };

  const CANCEL_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
  const canCancelUntil = (createdAt) => {
    const created = new Date(createdAt);
    return now <= created.getTime() + CANCEL_WINDOW_MS;
  };
  const remainingCountdown = (createdAt) => {
    const created = new Date(createdAt).getTime();
    const rem = created + CANCEL_WINDOW_MS - now;
    return Math.max(0, rem);
  };
  const formatMMSS = (ms) => {
    const total = Math.floor(ms / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  if (loading) {
    return (
      <div className="bookings-container">
        <div className="bookings-loading">
          <div className="loading-spinner"></div>
          <p>Loading your bookings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bookings-container">
        <div className="bookings-error">
          <div className="error-icon">⚠️</div>
          <h3>Error Loading Bookings</h3>
          <p>{error}</p>
          <button className="retry-btn" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bookings-container">
      <div className="bookings-content">
        <div className="bookings-header">
          <button className="bookings-back-btn" onClick={() => navigate('/', { replace: true })}>
            ← Back to Home
          </button>
          <h1 className="bookings-title">My Bookings</h1>
          <p className="bookings-subtitle">
            View and manage your room reservations
          </p>
        </div>

        {bookings.length === 0 ? (
          <div className="bookings-empty">
            <div className="empty-icon">📋</div>
            <h3>No Bookings Found</h3>
            <p>
              You haven't made any reservations yet. Start exploring our amazing
              rooms!
            </p>
            <button
              className="explore-btn"
              onClick={() => navigate("/room-details")}
            >
              Explore Rooms
            </button>
          </div>
        ) : (
          <div className="bookings-list">
            {bookings.map((booking) => (
              <div key={booking.id} className="booking-card">
                {/* Header */}
                <div className="booking-header minimal">
                  <div className="booking-info">
                    <h3 className="booking-room">{booking.room_name}</h3>
                    <div className="booking-dates">
                      {formatDate(booking.check_in)} – {formatDate(booking.check_out)}
                    </div>
                  </div>
                  {(() => {
                    const status = booking.status === 'completed' ? 'checked out' : booking.status;
                    return (
                      <div
                        className="booking-status pill"
                        style={{ color: getStatusColor(status) }}
                      >
                        <span className="status-icon">{getStatusIcon(status)}</span>
                        <span className="status-text">{status.toUpperCase()}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Body: two columns */}
                {(() => {
                  const nights = calculateNights(booking.check_in, booking.check_out);
                  const extra = getExtrasInfo(booking);
                  const baseRate = Math.max(0, Number(booking.total_amount || 0) - (extra.extraTotal || 0));
                  return (
                    <div className="booking-body two-col">
                      {/* Left info */}
                      <div className="col-left">
                        <div className="detail-row"><span className="detail-label">Check-in:</span><span className="detail-value">{formatDate(booking.check_in)}</span></div>
                        <div className="detail-row"><span className="detail-label">Check-out:</span><span className="detail-value">{formatDate(booking.check_out)}</span></div>
                        <div className="detail-row"><span className="detail-label">Nights:</span><span className="detail-value">{nights}</span></div>
                        <div className="detail-row"><span className="detail-label">Guests:</span><span className="detail-value">{booking.guest_count}</span></div>
                      </div>
                      {/* Right price */}
                      <div className="col-right price-box">
                        <div className="detail-row"><span className="detail-label">Base Rate:</span><span className="detail-value">₱{baseRate.toLocaleString()}</span></div>
                        <div className="detail-row"><span className="detail-label">Extras:</span></div>
                        <div className="extras-list">
                          {extra.bedCount > 0 && (
                            <div className="extra-line">• Extra Bed: ₱{(extra.bedsTotal || 0).toLocaleString()}</div>
                          )}
                          {extra.personCount > 0 && (
                            <div className="extra-line">• Extra Person: ₱{(extra.personsTotal || 0).toLocaleString()}</div>
                          )}
                          {extra.bedCount === 0 && extra.personCount === 0 && (
                            <div className="extra-line muted">• None</div>
                          )}
                        </div>
                        <div className="divider" />
                        <div className="detail-row total"><span className="detail-label">Total:</span><span className="detail-value total-amount">₱{Number(booking.total_amount || 0).toLocaleString()}</span></div>
                      </div>
                    </div>
                  );
                })()}

                {/* Special Requests */}
                {booking.special_requests && (
                  <div className="special-box">
                    <div className="special-title">📝 Special Requests</div>
                    <div className="special-text">{booking.special_requests}</div>
                  </div>
                )}

                {/* Payment Summary */}
                <div className="booking-payment-summary">
                  <div className="booking-payment-row">
                    <span>Total Room Cost:</span>
                    <span>₱{Number(booking.total_amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="booking-payment-row">
                    <span>Reservation Fee (30%):</span>
                    <span>₱{Math.round(Number(booking.total_amount || 0) * 0.3).toLocaleString()}</span>
                  </div>
                  <div className="booking-payment-row highlight">
                    <span>Remaining Balance (Due at Check-in):</span>
                    <span>₱{Math.round(Number(booking.total_amount || 0) * 0.7).toLocaleString()}</span>
                  </div>
                  <div className="non-refundable-notice">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 8V12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 16H12.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    This reservation fee is non-refundable
                  </div>
                </div>

                {/* Footer */}
                <div className="booking-footer minimal">
                  <div className="booking-created">Booked on {formatPHT(booking.created_at)} PHT</div>
                  {booking.status === 'pending' && (
                    (() => {
                      const enabled = canCancelUntil(booking.created_at);
                      const rem = remainingCountdown(booking.created_at);
                      return (
                        <button
                          className="cancel-btn"
                          disabled={!enabled}
                          title={enabled ? `Cancel available for ${formatMMSS(rem)}` : 'Cancellation window expired'}
                          onClick={() => {
                            if (!enabled) return;
                            if (window.confirm(`Cancel this booking? You have ${formatMMSS(rem)} left to cancel.`)) {
                              reservationService.cancelReservation(booking.id).then(() => window.location.reload());
                            }
                          }}
                        >
                          {enabled ? `Cancel (${formatMMSS(rem)})` : 'Cancel (expired)'}
                        </button>
                      );
                    })()
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Bookings;
