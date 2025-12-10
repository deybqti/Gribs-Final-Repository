import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import "./RoomDetails.css";
import logo from "../assets/Logo gold rock inn.png";
import { roomsApi, supabase } from "../lib/supabase";
import familyImg from "../../../rooms/family.jpg";
import juniorImg from "../../../rooms/junior.jpg";
import twinImg from "../../../rooms/twin.jpg";
import doubleImg from "../../../rooms/double.jpg";
import studioImg from "../../../rooms/studio.jpg";

const RoomDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Use values from location.state if present, otherwise default
  const {
    dateRange: initialDateRange,
    adults: initialAdults,
    children: initialChildren,
    cart: initialCart
  } = location.state || {};

  // State for rooms data from Supabase
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [modalRoomIdx, setModalRoomIdx] = useState(null);
  // Cart is now an array of bookings
  const [cart, setCart] = useState(initialCart || []); // [{ roomIdx, nights }]
  const [dateRange, setDateRange] = useState(initialDateRange || [
    {
      startDate: null,
      endDate: null,
      key: "selection",
    },
  ]);
  const [adults, setAdults] = useState(initialAdults ?? 0);
  const [children, setChildren] = useState(initialChildren ?? 0);
  const [availability, setAvailability] = useState({}); // { [room_name]: { available, capacity, reserved, isAvailable } }
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [occupiedDates, setOccupiedDates] = useState({}); // { [room_name]: string[] }
  const [occupiedSpans, setOccupiedSpans] = useState({}); // { [room_name]: { start: string, end: string }[] }
  // Extra beds per room index (selected before adding to cart)
  const [extraBeds, setExtraBeds] = useState({}); // { [roomIdx]: number }
  // Extra persons per room index (selected before adding to cart)
  const [extraPersons, setExtraPersons] = useState({}); // { [roomIdx]: number }
  // Confirm removal modal state
  const [confirmRemove, setConfirmRemove] = useState(null); // roomIdx to remove

  // Map room name to local image asset from front end/rooms
  const resolveRoomImg = (room) => {
    const name = String(room?.name || '').toLowerCase();
    if (name.includes('family')) return familyImg;
    if (name.includes('junior')) return juniorImg;
    if (name.includes('twin') && name.includes('superior')) return twinImg;
    if (name.includes('double') && name.includes('superior')) return doubleImg;
    if (name.includes('studio')) return studioImg;
    return room?.image || room?.images?.[0];
  };

  // Format dates for display
  const formatDate = (date) =>
    date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "N/A";

  const checkIn = dateRange?.[0]?.startDate ? new Date(dateRange[0].startDate) : null;
  const checkOut = dateRange?.[0]?.endDate ? new Date(dateRange[0].endDate) : null;
  const guestDisplay = `${adults ?? 0} Adult${adults === 1 ? "" : "s"}${children ? `, ${children} Child${children === 1 ? "" : "ren"}` : ""}`;

  // Calculate nights
  let nights = 1;
  if (checkIn && checkOut) {
    const diff = (checkOut - checkIn) / (1000 * 60 * 60 * 24);
    nights = Math.max(1, diff);
  }

  // Fetch rooms from Supabase
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        setLoading(true);
        const roomsData = await roomsApi.getAllRooms();
        setRooms(roomsData);
        setError(null);
      } catch (err) {
        console.error('Error fetching rooms:', err);
        setError('Failed to load rooms. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, []);

  // Fetch availability for all rooms when dates change
  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        if (!checkIn || !checkOut || rooms.length === 0) {
          setAvailability({});
          return;
        }
        setAvailabilityLoading(true);
        const start = checkIn.toISOString();
        const end = checkOut.toISOString();
        const results = await Promise.all(
          rooms.map(async (r) => {
            try {
              const url = `http://localhost:4000/api/availability?room_name=${encodeURIComponent(r.name)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
              const res = await fetch(url);
              if (!res.ok) return null;
              const data = await res.json();
              return data;
            } catch {
              return null;
            }
          })
        );
        const map = {};
        for (const item of results) {
          if (item && item.room_name) map[item.room_name] = item;
        }
        setAvailability(map);
      } finally {
        setAvailabilityLoading(false);
      }
    };
    fetchAvailability();
  }, [rooms, checkIn, checkOut]);

  // Build occupied dates and spans within the selected range per room
  useEffect(() => {
    const fetchOccupiedDates = async () => {
      try {
        if (!checkIn || !checkOut || rooms.length === 0) {
          setOccupiedDates({});
          setOccupiedSpans({});
          return;
        }
        const startStr = new Date(Date.UTC(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate())).toISOString().split('T')[0];
        const endStr = new Date(Date.UTC(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate())).toISOString().split('T')[0];
        const result = {};
        const resultSpans = {};
        for (const r of rooms) {
          const { data, error } = await supabase
            .from('reservations')
            .select('check_in, check_out, status')
            .eq('room_name', r.name)
            .lt('check_in', endStr)
            .gt('check_out', startStr);
          if (!error && Array.isArray(data)) {
            const set = new Set();
            const spans = [];
            for (const row of data) {
              const status = String(row.status || '').toLowerCase();
              if (status.includes('cancel') || status.includes('reject')) continue;
              const s = new Date(row.check_in);
              const e = new Date(row.check_out);
              const start = new Date(Math.max(new Date(startStr).getTime(), s.getTime()));
              const end = new Date(Math.min(new Date(endStr).getTime(), e.getTime()));
              if (start < end) {
                const ymd = (d) => {
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const da = String(d.getDate()).padStart(2, '0');
                  return `${y}-${m}-${da}`;
                };
                spans.push({ start: ymd(start), end: ymd(end) });
                for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
                  set.add(ymd(d));
                }
              }
            }
            result[r.name] = Array.from(set).sort();
            resultSpans[r.name] = spans;
          }
        }
        setOccupiedDates(result);
        setOccupiedSpans(resultSpans);
      } catch {
        // ignore
      }
    };
    fetchOccupiedDates();
  }, [rooms, checkIn, checkOut]);

  // Add room to cart (stackable, no duplicates)
  const handleBookNow = (roomIdx) => {
    setCart((prev) => {
      // Check if already in cart
      if (prev.some(item => item.roomIdx === roomIdx)) return prev;
      // Initialize extras to 0; user can adjust inside the cart
      return [...prev, { roomIdx, nights, extraBeds: 0, extraPersons: 0 }];
    });
  };

  // Remove room from cart
  const handleRemove = (roomIdx) => {
    setCart((prev) => prev.filter(item => item.roomIdx !== roomIdx));
  };
  const requestRemove = (roomIdx) => setConfirmRemove(roomIdx);
  const cancelRemove = () => setConfirmRemove(null);
  const confirmRemoveNow = () => {
    if (confirmRemove === null) return;
    handleRemove(confirmRemove);
    setConfirmRemove(null);
  };

  // Total price
  const total = cart.reduce((sum, item) => {
    const room = rooms[item.roomIdx];
    const base = room ? room.price * item.nights : 0;
    const beds = Number(item.extraBeds || 0);
    const persons = Number(item.extraPersons || 0);
    const extras = (beds * 300 + persons * 300) * item.nights; // ₱300 per bed/person per night
    return sum + base + extras;
  }, 0);

  // Check out handler
  const handleCheckout = () => {
    if (cart.length > 0) {
      navigate('/checkout', { state: { cart, dateRange, adults, children, rooms } });
    }
  };

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      setCart([]);
    }
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="room-details-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "white" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Loading rooms...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="room-details-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "white" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Error: {error}</div>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: "8px 16px", fontSize: "16px", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="room-details-bg" style={{ minHeight: "100vh" }}>
      {/* Room Details Modal */}
      {modalRoomIdx !== null && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.3)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }} onClick={() => setModalRoomIdx(null)}>
          <div style={{
            background: "#fff",
            borderRadius: 4,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            padding: 36,
            minWidth: 480,
            maxWidth: 600,
            position: "relative",
            display: "flex",
            flexDirection: "column"
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setModalRoomIdx(null)} className="rd-close" aria-label="Close">&times;</button>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 36, fontFamily: "serif", fontWeight: 500, marginBottom: 8 }}>{rooms[modalRoomIdx]?.name}</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span className="rd-badge rd-badge-blue">👥 Capacity: {rooms[modalRoomIdx]?.capacity}</span>
                  <span className="rd-badge rd-badge-purple">🛏️ Beds: {rooms[modalRoomIdx]?.beds}</span>
                </div>
                <div style={{ fontSize: 17, marginBottom: 8, fontWeight: 500 }}>Room Features:</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 16 }}>
                  {(rooms[modalRoomIdx]?.features || []).map(f => <li key={f}>{f}</li>)}
                </ul>
              </div>
              <img src={resolveRoomImg(rooms[modalRoomIdx])} alt={rooms[modalRoomIdx]?.name} style={{ width: 220, height: 140, objectFit: "cover", borderRadius: 4 }} />
            </div>
          </div>
        </div>
      )}
      <div className="room-details-overlay" />
      <div className="room-details-header">
        <img src={logo} alt="Gold Rock Inn Logo" className="room-details-logo" />
        <span className="room-details-title">GOLD ROCK INN</span>
        <div className="room-details-nav" />
        <div className="room-details-bookings">
          <span className="room-details-bookings-home" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>HOME</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", maxWidth: 1400, margin: "0 auto", flexWrap: "wrap" }}>
        <div className="room-details-content" style={{ flex: 2, minWidth: 0 }}>
          <div className="room-details-filters">
            <div className="room-details-filter-box">
              <span role="img" aria-label="guests">👤</span> Guests <b style={{ marginLeft: 4 }}>{guestDisplay}</b>
            </div>
            <div className="room-details-filter-box">
              <span role="img" aria-label="calendar">📅</span> Check-in <b style={{ marginLeft: 4 }}>{checkIn ? formatDate(checkIn) : "DATE"}</b>
            </div>
            <div className="room-details-filter-box">
              <span role="img" aria-label="calendar">📅</span> Check-out <b style={{ marginLeft: 4 }}>{checkOut ? formatDate(checkOut) : "DATE"}</b>
            </div>
          </div>
          <h2 className="room-details-section-title">Select a Room</h2>

          {rooms.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "white" }}>
              <div style={{ fontSize: "18px" }}>No rooms available at the moment.</div>
            </div>
          ) : (
            rooms.map((room, idx) => (
              <div className="modern-room-card" key={room.id}>
                <div className="room-card-image-container">
                  <img 
                    src={resolveRoomImg(room)} 
                    alt={room.name} 
                    className="room-card-image" 
                    loading="lazy"
                  />
                  <div className="room-card-overlay">
                    <div className="room-card-badges">
                      <span className="room-card-badge">👥 {room.capacity} Guests</span>
                      <span className="room-card-badge">🛏️ {room.beds} Beds</span>
                    </div>
                    <div className="room-card-price">
                      <span className="price-amount">₱{room.price?.toLocaleString()}</span>
                      <span className="price-period">/night</span>
                    </div>
                  </div>
                </div>
                <div className="room-card-content">
                  <div className="room-card-header">
                    <h3 className="room-card-title">{room.name}</h3>
                    <div className="room-card-fees">Excluding taxes and fees</div>
                  </div>
                  
                  <div className="room-features">
                    <h4 className="features-title">Room Features</h4>
                    <div className="features-grid">
                      <div className="feature-item">
                        <span className="feature-text">Luxurious Bed</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-text">Air Conditioning</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-text">Cable TV</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-text">Hot Shower</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-text">Free Wi-Fi</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-text">Coffee Setup</span>
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const isMaint = room?.maintenance === true || String(room?.status || '').toLowerCase() === 'maintenance';
                    const avail = availability[room.name];
                    const isSoldOut = avail ? avail.available <= 0 : false;
                    // Require dates and at least 1 adult before allowing booking
                    const missingDates = !checkIn || !checkOut;
                    const missingGuests = (adults ?? 0) <= 0; // must select at least 1 adult
                    const disabled = isMaint || isSoldOut || missingDates || missingGuests;
                    const disabledReason = isMaint
                      ? 'Unavailable: Maintenance'
                      : isSoldOut
                        ? 'Unavailable for selected dates'
                        : (missingDates || missingGuests)
                          ? 'Select check-in/check-out dates and guests'
                          : 'Add to cart';
                    const disabledLabel = isMaint
                      ? 'UNAVAILABLE - MAINTENANCE'
                      : isSoldOut
                        ? 'SOLD OUT FOR DATES'
                        : (missingDates || missingGuests)
                          ? 'SELECT DATES & GUESTS'
                          : 'BOOK NOW';
                    return (
                      <>
                        {isMaint && (
                          <div className="maint-note">This room is under maintenance and temporarily unavailable.</div>
                        )}
                        {!isMaint && isSoldOut && (
                          <div className="soldout-note">No availability for your selected dates.</div>
                        )}
                        <button
                          className={`room-card-book-btn${disabled ? ' disabled' : ''}`}
                          onClick={() => { if (!disabled) handleBookNow(idx); }}
                          disabled={disabled}
                          title={disabled ? disabledReason : 'Add to cart'}
                        >
                          {disabled ? disabledLabel : 'BOOK NOW'}
                        </button>
                        {!isMaint && isSoldOut && (occupiedSpans[room.name]?.length > 0) && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#4b5563' }}>
                            Occupied on: {(occupiedSpans[room.name] || [])
                              .map(span => {
                                const s = new Date(span.start + 'T00:00:00');
                                const e = new Date(span.end + 'T00:00:00');
                                const sf = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                                const ef = e.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                                return `${sf} – ${ef}`;
                              })
                              .join('; ')
                            }
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))
          )}
        </div>
        {/* Modern Cart Panel */}
        {cart.length > 0 && (
          <div className="modern-cart-panel">
            <div className="cart-header">
              <div className="cart-title">
                Your Cart: {cart.length} Item{cart.length > 1 ? "s" : ""}
              </div>
            </div>
            
            <div className="cart-content">
              {cart.map(item => {
                const room = rooms[item.roomIdx];
                return (
                  <div key={item.roomIdx} className="cart-item">
                    <div className="cart-item-header">
                      <div className="cart-item-name">{room?.name}</div>
                      <button 
                        className="cart-remove-btn"
                        onClick={() => requestRemove(item.roomIdx)}
                        title="Remove from cart"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="cart-item-price">
                      ₱{room?.price?.toLocaleString()} x {item.nights} Night{item.nights > 1 ? "s" : ""}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontWeight: 600 }}>Extra Beds</span>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <button
                            className="cart-remove-btn"
                            onClick={() => setCart(prev => prev.map(it => it.roomIdx === item.roomIdx ? { ...it, extraBeds: Math.max(0, Number(it.extraBeds || 0) - 1) } : it))}
                            title="Decrease extra beds"
                            aria-label="Decrease extra beds"
                            style={{
                              width: 28,
                              height: 24,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid #f0a3a3',
                              background: '#fff5f5',
                              color: '#b91c1c',
                              borderRadius: 6,
                              fontWeight: 700,
                              lineHeight: '0px',
                              cursor: 'pointer'
                            }}
                          >
                            −
                          </button>
                          <span style={{ minWidth: 20, textAlign: 'center' }}>{Number(item.extraBeds || 0)}</span>
                          <button
                            className="room-card-details-btn"
                            onClick={() => setCart(prev => prev.map(it => it.roomIdx === item.roomIdx ? { ...it, extraBeds: Math.min(4, Number(it.extraBeds || 0) + 1) } : it))}
                            title="Increase extra beds"
                            aria-label="Increase extra beds"
                            style={{
                              width: 28,
                              height: 24,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid #a7c6ff',
                              background: '#eef4ff',
                              color: '#1d4ed8',
                              borderRadius: 6,
                              fontWeight: 700,
                              lineHeight: '0px',
                              cursor: 'pointer'
                            }}
                          >
                            +
                          </button>
                          <span style={{ color: '#9aa4af', fontSize: 12 }}>(₱300 per bed/night)</span>
                        </div>
                        {Number(item.extraBeds || 0) > 0 && (
                          <span style={{ color: '#6b7280', marginLeft: 'auto' }}>
                            + ₱{(Number(item.extraBeds || 0) * 300 * item.nights).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 600 }}>Extra Persons</span>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <button
                            className="cart-remove-btn"
                            onClick={() => setCart(prev => prev.map(it => it.roomIdx === item.roomIdx ? { ...it, extraPersons: Math.max(0, Number(it.extraPersons || 0) - 1) } : it))}
                            title="Decrease extra persons"
                            aria-label="Decrease extra persons"
                            style={{
                              width: 28,
                              height: 24,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid #f0a3a3',
                              background: '#fff5f5',
                              color: '#b91c1c',
                              borderRadius: 6,
                              fontWeight: 700,
                              lineHeight: '0px',
                              cursor: 'pointer'
                            }}
                          >
                            −
                          </button>
                          <span style={{ minWidth: 20, textAlign: 'center' }}>{Number(item.extraPersons || 0)}</span>
                          <button
                            className="room-card-details-btn"
                            onClick={() => setCart(prev => prev.map(it => it.roomIdx === item.roomIdx ? { ...it, extraPersons: Math.min(4, Number(it.extraPersons || 0) + 1) } : it))}
                            title="Increase extra persons"
                            aria-label="Increase extra persons"
                            style={{
                              width: 28,
                              height: 24,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid #a7c6ff',
                              background: '#eef4ff',
                              color: '#1d4ed8',
                              borderRadius: 6,
                              fontWeight: 700,
                              lineHeight: '0px',
                              cursor: 'pointer'
                            }}
                          >
                            +
                          </button>
                          <span style={{ color: '#9aa4af', fontSize: 12 }}>(₱300 per person/night)</span>
                        </div>
                        {Number(item.extraPersons || 0) > 0 && (
                          <span style={{ color: '#6b7280', marginLeft: 'auto' }}>
                            + ₱{(Number(item.extraPersons || 0) * 300 * item.nights).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="cart-item-dates">
                      <div className="cart-date-item">
                        <span className="cart-date-label">Check-in:</span>
                        <span className="cart-date-value">
                          {checkIn ? checkIn.toLocaleDateString(undefined, { 
                            weekday: "short", 
                            month: "short", 
                            day: "numeric" 
                          }) : "Not set"}
                        </span>
                      </div>
                      <div className="cart-date-item">
                        <span className="cart-date-label">Check-out:</span>
                        <span className="cart-date-value">
                          {checkOut ? checkOut.toLocaleDateString(undefined, { 
                            weekday: "short", 
                            month: "short", 
                            day: "numeric" 
                          }) : "Not set"}
                        </span>
                      </div>
                    </div>
                    
                    <div className="cart-item-guests">
                      <span className="cart-guests-icon">👥</span>
                      {guestDisplay}
                    </div>
                  </div>
                );
              })}
              
              <div className="cart-total-section">
                <div className="cart-total-label">Total Amount</div>
                <div className="cart-total-amount">₱{total.toLocaleString()}</div>
              </div>
              <button
                style={{
                  width: "100%",
                  background: cart.length > 0 ? "#254e70" : "#888",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 0",
                  marginTop: 14,
                  fontSize: 18,
                  fontWeight: 500,
                  cursor: cart.length > 0 ? "pointer" : "not-allowed"
                }}
                disabled={cart.length === 0}
                onClick={handleCheckout}
              >
                Check out
              </button>
            {/* Confirm remove modal */}
            {confirmRemove !== null && createPortal(
              (
                <div role="dialog" aria-modal="true" style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 2147483647
                }}>
                  <div onClick={cancelRemove} style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.4)'
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '30%',
                    transform: 'translate(-50%, -30%)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    borderRadius: 8,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                    width: 'min(520px, 92vw)'
                  }}>
                    <div style={{ padding: 20 }}>
                      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Are you sure you want to remove this room from your booking?</div>
                      <div style={{ fontSize: 14, color: 'var(--color-muted)' }}>Select yes to confirm item removal</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '0 20px 20px 20px' }}>
                      <button onClick={confirmRemoveNow} style={{
                        background: 'transparent',
                        color: 'var(--color-primary)',
                        border: '2px solid var(--color-primary)',
                        borderRadius: 4,
                        padding: '8px 18px',
                        fontWeight: 600
                      }}>YES</button>
                      <button onClick={cancelRemove} style={{
                        background: 'var(--color-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '10px 18px',
                        fontWeight: 600
                      }}>NO</button>
                    </div>
                    <button onClick={cancelRemove} aria-label="Close" style={{
                      position: 'absolute',
                      right: -12,
                      top: -12,
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#ffffff',
                      border: '1px solid rgba(0,0,0,0.15)',
                      borderRadius: 9999,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      fontSize: 18,
                      lineHeight: '18px',
                      color: '#374151',
                      cursor: 'pointer'
                    }}>&times;</button>
                  </div>
                </div>
              ),
              document.body
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomDetails;
