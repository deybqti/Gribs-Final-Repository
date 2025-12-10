import React, { useState, useRef, useEffect } from "react";
import { createClient } from '@supabase/supabase-js';
import "./App.css";
import logo from "./assets/logo.png";
import bg from "../../rooms/GOLDROCKINN.jpg";
import { DateRange } from "react-date-range";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import Footer from "./components/Footer";
import AboutUs from "./components/AboutUs";
import Offers from "./components/Offers";
import Contact from "./components/Contact";
import RoomDetails from "./components/RoomDetails";
import Checkout from "./components/Checkout";
import Payment from "./components/Payment";
import Profile from "./components/Profile";
import Login from "./components/Login";
import Bookings from "./components/Bookings";
import ResetPassword from "./components/ResetPassword";
import ForgotPassword from "./components/ForgotPassword";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import profileIcon from "./assets/profile.png";

// Supabase client (used for OAuth sign-out when logging out)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function HomePage({
  showCalendar, setShowCalendar, dateRange, setDateRange, calendarRef,
  showGuest, setShowGuest, guestRef, adults, setAdults, children, setChildren
}) {
  const navigate = useNavigate();

  const formatDate = (date) =>
    date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const dateDisplay =
    dateRange[0].startDate && dateRange[0].endDate
      ? `${formatDate(dateRange[0].startDate)} - ${formatDate(dateRange[0].endDate)}`
      : "SELECT RANGE DATE";
  const guestDisplay = `${adults} Adult${adults !== 1 ? "s" : ""}, ${children} Child${children !== 1 ? "ren" : ""}`;

  // Disable Book Now until dates are selected and at least 1 adult
  const hasDates = Boolean(dateRange[0].startDate && dateRange[0].endDate);
  const hasGuests = adults > 0; // children can be 0
  const canBook = hasDates && hasGuests;

  const handleBookNow = () => {
    setShowCalendar(false);
    setShowGuest(false);
    navigate("/room-details", {
      state: {
        dateRange,
        adults,
        children,
      },
    });
  };

  return (
    <div className="booking-widget">
      <div className="booking-section" style={{ position: 'relative' }}>
        <div
          className="booking-value date"
          style={{ cursor: "pointer" }}
          onClick={() => setShowCalendar((v) => !v)}
        >
          {dateDisplay} <span className="calendar-icon">📅</span>
        </div>
        {showCalendar && (
          <div
            ref={calendarRef}
            style={{
              position: "absolute",
              zIndex: 10,
              bottom: "110%",
              left: 0,
              marginBottom: "10px",
              maxHeight: "350px",
              overflowY: "auto",
              background: "#fff",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              borderRadius: "10px"
            }}
          >
            <DateRange
              editableDateInputs={false}
              onChange={item => setDateRange([item.selection])}
              moveRangeOnFirstSelection={false}
              ranges={dateRange}
              minDate={new Date()}
              rangeColors={["#ffd700"]}
            />
          </div>
        )}
      </div>
      <div className="booking-section">
        <div
          className="booking-value guests"
          style={{ cursor: "pointer" }}
          onClick={() => setShowGuest((v) => !v)}
        >
          {guestDisplay} <span className="guest-icon" role="img" aria-label="guests">👥</span>
        </div>
        {showGuest && (
          <div ref={guestRef} className="guest-popup">
            <div className="guest-row">
              <span className="guest-label">Adults</span>
              <button
                className="guest-btn minus"
                onClick={() => setAdults(Math.max(0, adults - 1))}
                disabled={adults === 0}
              >
                −
              </button>
              <span className="guest-count">{adults}</span>
              <button className="guest-btn plus" onClick={() => setAdults(adults + 1)}>
                +
              </button>
            </div>
            <div className="guest-row">
              <span className="guest-label">Children</span>
              <button
                className="guest-btn minus"
                onClick={() => setChildren(Math.max(0, children - 1))}
                disabled={children === 0}
              >
                −
              </button>
              <span className="guest-count">{children}</span>
              <button className="guest-btn plus" onClick={() => setChildren(children + 1)}>
                +
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        className="book-now"
        onClick={handleBookNow}
        disabled={!canBook}
        title={canBook ? 'Book now' : 'Select date range and guests first'}
      >
        BOOK NOW
      </button>
    </div>
  );
}

function ProfileMenu() {
  const [showMenu, setShowMenu] = React.useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const menuRef = React.useRef();

  const handleLogout = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Best-effort sign out of Supabase to avoid auto-login redirect from existing OAuth session
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    localStorage.removeItem('user');
    localStorage.removeItem('cart');
    setShowMenu(false);
    navigate('/login', { replace: true });
  };

  const handleProfile = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowMenu(false);
    navigate('/profile');
  };

  const handleBookings = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowMenu(false);
    navigate('/bookings');
  };

  // Handle click outside to close menu
  React.useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }

    if (showMenu) {
      // Add a small delay to prevent immediate closing when clicking buttons
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMenu]);

  return (
    <div ref={menuRef} style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
      <img
        src={profileIcon}
        alt="Profile"
        className="profile-avatar"
        style={{ width: 64, height: 64, borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.10)', cursor: 'pointer' }}
        title="Profile"
        onClick={() => setShowMenu(v => !v)}
      />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {user?.full_name && (
          <span style={{ fontFamily: 'Segoe UI, Arial, sans-serif', fontWeight: 700, fontSize: 22, color: '#fff', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 2px 8px #222, 0 1px 2px #000' }}>
            {user.full_name}
          </span>
        )}
      </div>
      {showMenu && (
        <div 
          style={{
            position: 'absolute',
            top: 74,
            right: 0,
            background: '#fff',
            border: '1px solid #e9ecef',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 180
          }}
        >
          <button
            onClick={handleProfile}
            style={{
              width: '100%',
              background: 'transparent',
              color: '#254e70',
              border: 'none',
              borderRadius: '6px 6px 0 0',
              padding: '12px 16px',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'background 0.2s',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#f8f9fa'; e.currentTarget.style.transform = 'scale(1.02)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={e => { e.currentTarget.style.background = '#e9ecef'; }}
            onMouseUp={e => { e.currentTarget.style.background = '#f8f9fa'; }}
          >
            <span>👤</span>
            Profile
          </button>
          <div style={{ height: '1px', background: '#e9ecef' }}></div>
          <button
            onClick={handleBookings}
            style={{
              width: '100%',
              background: 'transparent',
              color: '#254e70',
              border: 'none',
              borderRadius: '0',
              padding: '12px 16px',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'background 0.2s',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#f8f9fa'; e.currentTarget.style.transform = 'scale(1.02)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={e => { e.currentTarget.style.background = '#e9ecef'; }}
            onMouseUp={e => { e.currentTarget.style.background = '#f8f9fa'; }}
          >
            <span>📋</span>
            My Bookings
          </button>
          <div style={{ height: '1px', background: '#e9ecef' }}></div>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              background: 'transparent',
              color: '#e74c3c',
              border: 'none',
              borderRadius: '0 0 6px 6px',
              padding: '12px 16px',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'background 0.2s',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#f8f9fa'; e.currentTarget.style.transform = 'scale(1.02)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={e => { e.currentTarget.style.background = '#e9ecef'; }}
            onMouseUp={e => { e.currentTarget.style.background = '#f8f9fa'; }}
          >
            <span>🚪</span>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  const [showCalendar, setShowCalendar] = useState(false);
  const [dateRange, setDateRange] = useState([
    {
      startDate: null,
      endDate: null,
      key: "selection",
    },
  ]);
  const [showGuest, setShowGuest] = useState(false);
  const [adults, setAdults] = useState(0);
  const [children, setChildren] = useState(0);
  const calendarRef = useRef();
  const guestRef = useRef();
  const location = useLocation();
  const navigate = useNavigate();

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [showToasts, setShowToasts] = useState([]); // transient toasts

  useEffect(() => {
    const user = localStorage.getItem('user');
    const isAuthRoute = ['/login', '/reset-password', '/forgot-password'].includes(location.pathname);
    
    if (!user && !isAuthRoute) {
      navigate("/login");
    }
  }, [location.pathname, navigate]);

  // Subscribe to booking status changes for current user and show notification on confirmed
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return;
    const nameLower = String(user.full_name || user.email || '').trim().toLowerCase();
    if (!nameLower) return;

    // Create a Realtime channel listening for updates to reservations for this user
    const channel = supabase
      .channel('booking_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reservations'
        },
        (payload) => {
          const newRow = payload?.new || {};
          const oldRow = payload?.old || {};
          const uname = String(newRow?.user_name || '').trim().toLowerCase();
          if (uname === nameLower && newRow?.status && newRow.status.toLowerCase() === 'confirmed' && String(oldRow?.status || '').toLowerCase() !== 'confirmed') {
            const message = `Your booking for ${newRow.room_name || 'a room'} is confirmed.`;
            const note = {
              id: `${newRow.id}-${Date.now()}`,
              message,
              at: new Date().toISOString(),
              bookingId: newRow.id
            };
            setNotifications(prev => [note, ...prev].slice(0, 20));
            setShowToasts(prev => [note, ...prev]);
            // Auto-hide toast after 6s
            setTimeout(() => {
              setShowToasts(prev => prev.filter(t => t.id !== note.id));
            }, 6000);
          }
        }
      )
      .subscribe((status) => {
        return status;
      });

    return () => {
      try { supabase.removeChannel(channel); } catch (_) {}
    };
  }, []);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
      if (guestRef.current && !guestRef.current.contains(event.target)) {
        setShowGuest(false);
      }
    }
    if (showCalendar || showGuest) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar, showGuest]);

  if (location.pathname === "/room-details") {
    return <RoomDetails />;
  }

  if (location.pathname === "/checkout") {
    return <div style={{ minHeight: '100vh', background: '#fff' }}><Checkout /></div>;
  }

  if (location.pathname === "/payment") {
    return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}><Payment /></div>;
  }

  if (location.pathname === "/profile") {
    return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}><Profile /></div>;
  }

  if (location.pathname === "/bookings") {
    return <div style={{ minHeight: '100vh', background: '#f5f7fa' }}><Bookings /></div>;
  }

  if (location.pathname === "/login") {
    return <div style={{ minHeight: '100vh', background: '#f8f8f8' }}><Login /></div>;
  }

  // Render Forgot Password without site header/footer/background
  if (location.pathname === "/forgot-password") {
    return <div style={{ minHeight: '100vh', background: '#f8f8f8' }}><ForgotPassword /></div>;
  }

  // Render Reset Password without site header/footer/background
  if (location.pathname === "/reset-password") {
    return <div style={{ minHeight: '100vh', background: '#f8f8f8' }}><ResetPassword /></div>;
  }

  return (
    <div className="app-container" style={{ backgroundImage: `url(${bg})` }}>
      <header className="header">
        <div className="logo-nav">
          <img src={logo} alt="Gold Rock Inn Logo" className="logo" />
          <span className="logo-text">GOLD ROCK INN</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ProfileMenu />
        </div>
      </header>
      {/* Toast notifications */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {showToasts.map(t => (
          <div key={t.id} style={{
            background: '#2ecc71',
            color: '#fff',
            padding: '12px 14px',
            borderRadius: 8,
            boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
            maxWidth: 320,
            fontWeight: 600
          }}>
            ✅ {t.message}
          </div>
        ))}
      </div>
      <div className="main-content" style={{minHeight: '570px'}}>
        <Routes>
          <Route path="/" element={
            <HomePage
              showCalendar={showCalendar}
              setShowCalendar={setShowCalendar}
              dateRange={dateRange}
              setDateRange={setDateRange}
              calendarRef={calendarRef}
              showGuest={showGuest}
              setShowGuest={setShowGuest}
              guestRef={guestRef}
              adults={adults}
              setAdults={setAdults}
              children={children}
              setChildren={setChildren}
            />
          } />
          <Route path="/login" element={<Login />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/room-details" element={<RoomDetails />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}

export default App;
