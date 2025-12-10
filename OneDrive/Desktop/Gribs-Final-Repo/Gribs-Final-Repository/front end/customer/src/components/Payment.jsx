import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { paymentService, reservationService } from "../services/database";
import "./Payment.css";

const Payment = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    reservations, 
    cart, 
    dateRange, 
    adults, 
    children, 
    rooms, 
    total, 
    reservationFee, 
    remainingBalance 
  } = location.state || {};
  
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("gcash"); // default to 'gcash' per DB constraint
  const [specialRequest, setSpecialRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!cart || cart.length === 0) {
    return (
      <div className="payment-container">
        <div className="payment-empty">
          <div className="payment-empty-icon">🛒</div>
          <h2>No booking found</h2>
          <p>Please go back and select rooms for your booking.</p>
          <button className="payment-back-btn" onClick={() => navigate("/room-details")}>
            Select Rooms
          </button>
        </div>
      </div>
    );
  }

  const checkIn = dateRange?.[0]?.startDate ? new Date(dateRange[0].startDate) : null;
  const checkOut = dateRange?.[0]?.endDate ? new Date(dateRange[0].endDate) : null;
  const guestDisplay = `${adults ?? 0} Adult${adults === 1 ? "" : "s"}${children ? `, ${children} Child${children === 1 ? "" : "ren"}` : ""}`;
  const nights = checkIn && checkOut ? Math.max(1, (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)) : 1;
  const calculatedTotal = cart.reduce((sum, item) => {
    const room = rooms?.[item.roomIdx];
    const base = room ? room.price * item.nights : 0;
    const beds = Number(item.extraBeds || 0);
    const persons = Number(item.extraPersons || 0);
    const extras = (beds * 300 + persons * 300) * item.nights; // ₱300 per bed/person per night
    return sum + base + extras;
  }, 0);
  
  const displayTotal = typeof total === 'number' ? total : calculatedTotal;
  const displayReservationFee = typeof reservationFee === 'number' ? 
    reservationFee : 
    calculatedTotal * 0.3;
  const displayRemainingBalance = typeof remainingBalance === 'number' ? 
    remainingBalance : 
    calculatedTotal - displayReservationFee;

  const handleSubmitPayment = async () => {
    if (!referenceNumber.trim()) {
      setError("Please enter a reference number");
      return;
    }

    setIsSubmitting(true);
    setError("");
    
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user) {
        setError("Please log in to complete your booking");
        navigate('/login');
        return;
      }
      
      // Ensure reservations exist: if none passed from Checkout, create them now
      const toLocalYMD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${da}`;
      };
      let currentReservations = Array.isArray(reservations) ? reservations : [];
      if (currentReservations.length === 0) {
        const createPayloads = cart.map(item => {
          const room = rooms?.[item.roomIdx];
          const beds = Number(item.extraBeds || 0);
          const persons = Number(item.extraPersons || 0);
          const base = room ? room.price * item.nights : 0;
          const extras = (beds * 300 + persons * 300) * item.nights;
          const srParts = [];
          if (beds > 0) srParts.push(`Extra beds: ${beds} (₱300/bed/night)`);
          if (persons > 0) srParts.push(`Extra persons: ${persons} (₱300/person/night)`);
          return {
            user_name: user.full_name || user.email || 'Guest',
            room_name: room?.name || `Room #${item.roomIdx + 1}`,
            check_in: toLocalYMD(checkIn),
            check_out: toLocalYMD(checkOut),
            guest_count: (adults || 0) + (children || 0),
            total_amount: base + extras,
            special_requests: srParts.length ? srParts.join('\n') : null,
            extra_beds: beds,
            extra_persons: persons,
            status: 'pending'
          };
        });
        const created = await Promise.all(createPayloads.map(payload => reservationService.createReservation(payload)));
        const failed = created.filter(r => !r.success);
        if (failed.length) {
          setError(`Some reservations could not be created: ${failed[0].error}`);
          return;
        }
        currentReservations = created.map(r => r.data);
      }

      // Persist special requests on reservations before creating payments
      // IMPORTANT: Append user's note to existing special_requests (do NOT overwrite),
      // so previously set data like "Extra beds: X (₱300/bed/night)" is preserved.
      if (specialRequest.trim()) {
        const note = specialRequest.trim();
        await Promise.all(
          currentReservations.map(r => {
            const combined = [r.special_requests, note].filter(Boolean).join('\n');
            return reservationService.updateReservation(r.id, { special_requests: combined });
          })
        );
      }

      // Update payments for each reservation
      const paymentPromises = currentReservations.map(async (reservation) => {
        const paymentData = {
          reservation_id: reservation.id, // Direct access to reservation ID
          amount: displayReservationFee,
          method: paymentMethod,
          status: 'completed',
          payment_reference: referenceNumber,
          payment_type: 'reservation_fee',
          transaction_id: referenceNumber,
          currency: 'PHP',
          gateway_response: {
            reference: referenceNumber,
            method: paymentMethod,
            processed_at: new Date().toISOString()
          }
        };

        return paymentService.createPayment(paymentData);
      });

      // Wait for all payments to be created
      const results = await Promise.all(paymentPromises);
      
      // Check if all payments were created successfully
      const failedPayments = results.filter(result => !result.success);
      if (failedPayments.length > 0) {
        console.error('Failed payments:', failedPayments);
        const firstError = failedPayments[0]?.error || 'Unknown error';
        setError(`Some payments could not be processed: ${firstError}`);
        return;
      }

      // Keep reservations as 'pending' for admin review
      alert(`Payment submitted successfully! ${results.length} booking(s) created and pending approval.`);
      
      // Clear cart and redirect to home
      localStorage.removeItem('cart');
      navigate("/bookings");
      
    } catch (error) {
      console.error('Payment error:', error);
      setError(`Error processing payment: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="payment-container">
      <div className="payment-content">
        <div className="payment-header">
          <button
            className="payment-return-btn"
            onClick={() => navigate('/checkout', { state: { cart, dateRange, adults, children, rooms } })}
          >
            ← Back to Checkout
          </button>
          <h1 className="payment-title">Payment</h1>
          <p className="payment-subtitle">Complete your booking by scanning the QR code and entering payment details</p>
        </div>

        <div className="payment-main">
          <div className="payment-left">
            <div className="payment-summary">
              <h3 className="payment-summary-title">Booking Summary</h3>
              <div className="payment-summary-row">
                <span>Total Room Cost:</span>
                <span>₱{displayTotal.toLocaleString()}</span>
              </div>
              <div className="payment-summary-row">
                <span>Reservation Fee (30%):</span>
                <span>₱{displayReservationFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="payment-summary-row highlight">
                <span>Remaining Balance (Due at Check-in):</span>
                <span>₱{displayRemainingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="payment-rooms">
                {cart.map(item => {
                  const room = rooms?.[item.roomIdx];
                  const beds = Number(item.extraBeds || 0);
                  const persons = Number(item.extraPersons || 0);
                  return (
                    <div key={item.roomIdx} className="payment-room">
                      <div className="payment-room-name">{room?.name || `Room #${item.roomIdx + 1}`}</div>
                      <div className="payment-lineitems">
                        <div className="payment-line">
                          <span className="price-chip">₱{room ? room.price.toLocaleString() : '0'}</span>
                          <span className="mult">× {item.nights} night{item.nights > 1 ? 's' : ''}</span>
                        </div>
                        {(beds > 0 || persons > 0) && (
                          <div className="extras-wrap">
                            {beds > 0 && (
                              <span className="extra-chip">
                                Extra Beds: {beds}
                                <span className="muted"> × ₱300 × {item.nights} night{item.nights > 1 ? 's' : ''}</span>
                                <span className="amount"> = ₱{(beds * 300 * item.nights).toLocaleString()}</span>
                              </span>
                            )}
                            {persons > 0 && (
                              <span className="extra-chip">
                                Extra Persons: {persons}
                                <span className="muted"> × ₱300 × {item.nights} night{item.nights > 1 ? 's' : ''}</span>
                                <span className="amount"> = ₱{(persons * 300 * item.nights).toLocaleString()}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="payment-details">
                <div className="payment-detail-item">
                  <span className="payment-detail-label">Check-in:</span>
                  <span className="payment-detail-value">{checkIn ? checkIn.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  }) : "-"}</span>
                </div>
                <div className="payment-detail-item">
                  <span className="payment-detail-label">Check-out:</span>
                  <span className="payment-detail-value">{checkOut ? checkOut.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  }) : "-"}</span>
                </div>
                <div className="payment-detail-item">
                  <span className="payment-detail-label">Guests:</span>
                  <span className="payment-detail-value">{guestDisplay}</span>
                </div>
                <div className="payment-amount">
                  <div className="payment-amount-label">Amount to Pay Now</div>
                  <div className="payment-amount-value">₱{displayReservationFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                  <div className="non-refundable-notice" style={{
                    fontSize: '12px',
                    color: '#ef4444',
                    marginTop: '8px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 8V12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 16H12.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    This downpayment is non-refundable
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="payment-right">
            <div className="qr-section">
              <h3 className="qr-title">Scan QR Code to Pay</h3>
              <div className="qr-container">
                <img 
                  src="/qr-code.svg" 
                  alt="QR Code for Payment" 
                  className="qr-image"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="qr-placeholder" style={{ display: 'none' }}>
                  <div className="qr-placeholder-content">
                    <div className="qr-placeholder-icon">📱</div>
                    <div className="qr-placeholder-text">QR Code Image</div>
                    <div className="qr-placeholder-subtext">Place your QR code image here</div>
                  </div>
                </div>
              </div>
              <p className="qr-instruction">Scan this QR code with your mobile payment app to complete the transaction</p>
            </div>

            <div className="payment-form">
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span className="form-radio" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <input type="radio" checked readOnly />
                    <span>Gcash</span>
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="referenceNumber" className="form-label">
                  Wallet Reference Number <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="referenceNumber"
                  className="form-input"
                  placeholder={'GCash ref no.'}
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  required
                />
                <small className="form-help">Enter the reference number from your Gcash transaction</small>
              </div>

              <div className="form-group">
                <label htmlFor="specialRequest" className="form-label">
                  Special Requests / Notes
                </label>
                <textarea
                  id="specialRequest"
                  className="form-textarea"
                  placeholder="Any special requests or notes for your stay..."
                  value={specialRequest}
                  onChange={(e) => setSpecialRequest(e.target.value)}
                  rows="4"
                />
                <small className="form-help">Optional: Add any special requests or notes for your booking</small>
              </div>

              {error && (
                <div className="payment-error" style={{ 
                  background: '#fee', 
                  color: '#c33', 
                  padding: '12px', 
                  borderRadius: '8px', 
                  marginBottom: '16px',
                  textAlign: 'center'
                }}>
                  {error}
                </div>
              )}

              <button 
                className="payment-submit-btn" 
                onClick={handleSubmitPayment}
                disabled={isSubmitting || !referenceNumber.trim()}
              >
                {isSubmitting ? "Processing Payment..." : "Complete Payment"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payment;
