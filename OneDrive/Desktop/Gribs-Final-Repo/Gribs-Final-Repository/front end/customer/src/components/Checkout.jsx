import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { reservationService } from "../services/database";
import "./Checkout.css";

const Checkout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, dateRange, adults, children, rooms } = location.state || {};
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!cart || cart.length === 0) {
    return (
      <div className="checkout-container">
        <div className="checkout-empty">
          <div className="checkout-empty-icon">🛒</div>
          <h2>Your cart is empty</h2>
          <p>Looks like you haven't added any rooms to your cart yet. Start exploring our amazing rooms!</p>
          <button className="checkout-back-btn" onClick={() => navigate("/room-details")}>
            Explore Rooms
          </button>
        </div>
      </div>
    );
  }

  const checkIn = dateRange?.[0]?.startDate ? new Date(dateRange[0].startDate) : null;
  const checkOut = dateRange?.[0]?.endDate ? new Date(dateRange[0].endDate) : null;
  const guestDisplay = `${adults ?? 0} Adult${adults === 1 ? "" : "s"}${children ? `, ${children} Child${children === 1 ? "" : "ren"}` : ""}`;
  const nights = checkIn && checkOut ? Math.max(1, (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)) : 1;
  const total = cart.reduce((sum, item) => {
    const room = rooms?.[item.roomIdx];
    const base = room ? room.price * item.nights : 0;
    const beds = Number(item.extraBeds || 0);
    const persons = Number(item.extraPersons || 0);
    const extras = (beds * 300 + persons * 300) * item.nights; // ₱300 per bed/person per night
    return sum + base + extras;
  }, 0);

  // Calculate 30% reservation fee
  const reservationFee = total * 0.3;
  const remainingBalance = total - reservationFee;

  const handleProceedToPayment = async () => {
    setLoading(true);
    setError("");
    try {
      // Only pass context; reservations will be created after payment submission
      const bookingData = {
        cart,
        dateRange,
        adults,
        children,
        rooms,
        total,
        reservationFee,
        remainingBalance
      };
      navigate('/payment', { state: bookingData });
    } catch (err) {
      console.error('Navigate to payment error:', err);
      setError(`An error occurred: ${err.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="checkout-container">
      <div className="checkout-content">
        <div className="checkout-header">
          <button
            className="checkout-return-btn"
            onClick={() => navigate('/room-details', { state: { cart, dateRange, adults, children, rooms } })}
          >
            Return to Room Selection
          </button>
          <h1 className="checkout-title">Checkout Summary</h1>
          <p className="checkout-subtitle">Review your booking details before proceeding to payment</p>
        </div>

        <div className="checkout-summary">
          <h3 className="checkout-summary-title">Your Selected Rooms</h3>
          <div className="checkout-list">
            {cart.map(item => {
              const room = rooms?.[item.roomIdx];
              const beds = Number(item.extraBeds || 0);
              const persons = Number(item.extraPersons || 0);
              return (
                <div key={item.roomIdx} className="checkout-room">
                  <div className="checkout-room-name">{room?.name || `Room #${item.roomIdx + 1}`}</div>
                  <div className="checkout-lineitems">
                    <div className="checkout-line">
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
        </div>

        <div className="checkout-info">
          <h3 className="checkout-info-title">Booking Details</h3>
          <div className="checkout-info-item">
            <span className="checkout-info-label">Check-in Date</span>
            <span className="checkout-info-value">{checkIn ? checkIn.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            }) : "-"}</span>
          </div>
          <div className="checkout-info-item">
            <span className="checkout-info-label">Check-out Date</span>
            <span className="checkout-info-value">{checkOut ? checkOut.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            }) : "-"}</span>
          </div>
          <div className="checkout-info-item">
            <span className="checkout-info-label">Number of Nights</span>
            <span className="checkout-info-value">{nights} Night{nights > 1 ? "s" : ""}</span>
          </div>
          <div className="checkout-info-item">
            <span className="checkout-info-label">Guests</span>
            <span className="checkout-info-value">{guestDisplay}</span>
          </div>
        </div>

        <div className="checkout-info">
          <h3 className="checkout-info-title">Payment Summary</h3>
          <div className="checkout-info-item">
            <span className="checkout-info-label">Total Room Cost</span>
            <span className="checkout-info-value">₱{total.toLocaleString()}</span>
          </div>
          <div className="checkout-info-item">
            <span className="checkout-info-label">Reservation Fee (30%)</span>
            <span className="checkout-info-value">₱{reservationFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="checkout-info-item" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <span className="checkout-info-label" style={{ fontWeight: '600', color: '#1e293b' }}>Remaining Balance</span>
            <span className="checkout-info-value" style={{ fontWeight: '700', color: '#1C3A5E' }}>₱{remainingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="checkout-total-section" style={{ marginTop: '8px' }}>
          <div className="checkout-total-label">Amount to Pay Now</div>
          <div className="checkout-total">₱{reservationFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>

        {error && (
          <div className="checkout-error" style={{ 
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
          className="checkout-pay-btn" 
          onClick={handleProceedToPayment}
          disabled={loading}
        >
          {loading ? "Creating Reservations..." : "Proceed to Payment"}
        </button>
      </div>
    </div>
  );
};

export default Checkout; 