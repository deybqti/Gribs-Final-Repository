import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { 
  Home, 
  Bed, 
  BookOpen, 
  Users, 
  BarChart2, 
  Settings, 
  Bell, 
  BookOpenText,
  LogOut
} from 'lucide-react';
import Rooms from './Rooms.jsx';
import Reports from './Reports.jsx';
import Bookings from './Bookings';
import Customers from './Customers.jsx';
import { supabase, adminAuth } from './lib/supabase';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import AdminManagement from './AdminManagement';
import './Navbar.css';
import Sidebar from './Sidebar.jsx';

const sidebarItems = [
  { name: 'Dashboard', icon: <Home size={20} />, path: '/' },
  { name: 'Bookings', icon: <BookOpen size={20} />, path: '/bookings' },
  { name: 'Customers', icon: <Users size={20} />, path: '/customers' },
  { name: 'Rooms', icon: <Bed size={20} />, path: '/rooms' },
  { name: 'Reports', icon: <BarChart2 size={20} />, path: '/reports' },
  { name: 'Admin Management', icon: <Settings size={20} />, path: '/admin-management' },
];

function App() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const [lastSeenAt, setLastSeenAt] = useState(null);
  const [authed, setAuthed] = useState(!!adminAuth.getToken());
  const [adminUser, setAdminUser] = useState(() => adminAuth.getUser());

  useEffect(() => {
    // Listen for login/logout events and focus/storage to refresh auth state
    const onAuthChange = () => {
      setAuthed(!!adminAuth.getToken());
      setAdminUser(adminAuth.getUser());
    };
    window.addEventListener('admin-auth-changed', onAuthChange);
    window.addEventListener('storage', onAuthChange);
    window.addEventListener('focus', onAuthChange);
    return () => {
      window.removeEventListener('admin-auth-changed', onAuthChange);
      window.removeEventListener('storage', onAuthChange);
      window.removeEventListener('focus', onAuthChange);
    };
  }, []);

  useEffect(() => {
    if (!authed) return; // only after login
    // Preload latest reservation timestamp to avoid false notifications on load
    (async () => {
      try {
        // Fetch recent checked out payments then enrich with reservation details
        const { data: payments, error } = await supabase
          .from('payments')
          .select('id, reservation_id, created_at, status')
          .eq('status', 'checked out')
          .order('created_at', { ascending: false })
          .limit(5);
        if (error) {
          console.warn('Prefetch latest checked out payments failed:', error.message);
        } else if (Array.isArray(payments) && payments.length > 0) {
          const ids = payments.map(p => p.reservation_id).filter(Boolean);
          let resMap = {};
          if (ids.length > 0) {
            const { data: reservations, error: resErr } = await supabase
              .from('reservations')
              .select('id, user_name, room_name, status')
              .in('id', ids);
            if (resErr) {
              console.warn('Prefetch reservation lookup failed:', resErr.message);
            } else if (Array.isArray(reservations)) {
              resMap = Object.fromEntries(reservations.map(r => [r.id, r]));
            }
          }
          const items = payments.map(p => ({
            id: p.id,
            user_name: resMap[p.reservation_id]?.user_name || 'Guest',
            room_name: resMap[p.reservation_id]?.room_name || 'Room',
            created_at: p.created_at,
            status: 'paid',
          }));
          setLastSeenAt(payments[0].created_at);
          setNotifications(items);
        }
      } catch (e) {
        console.warn('Prefetch latest payments error:', e);
      }
    })();

    // Subscribe to reservations changes
    const channel = supabase
      .channel('payments-notify')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, (payload) => {
        const p = payload.new || payload.record || {};
        console.log('[Realtime] payments change:', payload);
        if (!p || !p.id) return;
        // Only notify when a payment is completed
        if (p.status !== 'completed') return;
        (async () => {
          try {
            let user_name = 'Guest';
            let room_name = 'Room';
            if (p.reservation_id) {
              const { data: r, error: rErr } = await supabase
                .from('reservations')
                .select('id, user_name, room_name')
                .eq('id', p.reservation_id)
                .maybeSingle();
              if (!rErr && r) {
                user_name = r.user_name || user_name;
                room_name = r.room_name || room_name;
              }
            }
            const item = {
              id: p.id,
              user_name,
              room_name,
              created_at: p.created_at,
              status: 'paid',
            };
            setNotifications((prev) => [item, ...prev].slice(0, 10));
            setUnreadCount((c) => c + 1);
            if (p.created_at) setLastSeenAt(p.created_at);
          } catch (err) {
            console.warn('[Realtime] enrich payment failed:', err);
          }
        })();
      })
      .subscribe((status) => {
        console.log('[Realtime] channel status:', status);
      });

    return () => {
      try { supabase.removeChannel(channel); } catch (e) { /* noop */ }
    };
  }, [authed]);

  useEffect(() => {
    if (!authed) return; // only after login
    // Fallback polling every 5s if realtime is unavailable; pause when tab hidden
    let interval;
    const tick = async () => {
      try {
        const { data: p, error } = await supabase
          .from('payments')
          .select('id, reservation_id, created_at, status')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('[Polling] latest payment error:', error.message);
          return;
        }
        if (p && p.created_at && (!lastSeenAt || new Date(p.created_at) > new Date(lastSeenAt))) {
          console.log('[Polling] detected completed payment:', p);
          let user_name = 'Guest';
          let room_name = 'Room';
          if (p.reservation_id) {
            const { data: r, error: rErr } = await supabase
              .from('reservations')
              .select('id, user_name, room_name')
              .eq('id', p.reservation_id)
              .maybeSingle();
            if (!rErr && r) {
              user_name = r.user_name || user_name;
              room_name = r.room_name || room_name;
            }
          }
          const item = {
            id: p.id,
            user_name,
            room_name,
            created_at: p.created_at,
            status: 'paid',
          };
          setNotifications((prev) => [item, ...prev].slice(0, 10));
          setUnreadCount((c) => c + 1);
          setLastSeenAt(p.created_at);
        }
      } catch (e) {
        console.warn('[Polling] exception:', e);
      }
    };
    const start = () => {
      clearInterval(interval);
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') tick();
      }, 5000);
    };
    start();
    return () => clearInterval(interval);
  }, [lastSeenAt, authed]);

  useEffect(() => {
    // Close dropdowns on outside click
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const toggleNotifications = () => {
    setNotificationsOpen((o) => !o);
    setUnreadCount(0);
    setProfileOpen(false);
  };

  const toggleProfile = () => {
    setProfileOpen((o) => !o);
    setNotificationsOpen(false);
  };

  const handleLogout = async () => {
    try {
      adminAuth.logout();
      window.location.href = '/login';
    } catch (e) {
      alert('Failed to logout');
    }
  };

    // If not authenticated, only allow access to /login
  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Determine role and build sidebar items accordingly
  const role = (adminUser?.role || (adminUser?.username === 'owner' ? 'owner' : 'admin')).toLowerCase();
  const isOwner = role === 'owner' || adminUser?.username === 'owner';
  const visibleSidebarItems = isOwner
    ? sidebarItems
    : sidebarItems.filter(item => item.path !== '/admin-management');

  return (
    <div className="flex min-h-screen bg-[#151e2e] text-white">
        {/* Sidebar */}
        <Sidebar items={visibleSidebarItems} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Topbar */}
          <header className="topbar">
            <div className="topbar-title">
              <div className="flex items-center">
                <span className="topbar-username">Welcome back, {adminUser?.username || 'User'}</span>
              </div>
            </div>
            <div className="topbar-actions">
              {/* Notifications */}
              <div className="topbar-icon relative" ref={notifRef} onClick={toggleNotifications} title="Notifications">
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="notif-badge">{unreadCount}</span>
                )}
                {notificationsOpen && (
                  <div className="dropdown-menu right">
                    <div className="dropdown-header">Recent Bookings</div>
                    {notifications.length === 0 ? (
                      <div className="dropdown-empty">No new bookings</div>
                    ) : (
                      <ul className="dropdown-list">
                        {notifications.map((n) => (
                          <li key={n.id} className="dropdown-item">
                            <div className="font-semibold">New booking</div>
                            <div className="text-xs text-gray-300">{n.user_name} booked {n.room_name}</div>
                            <div className="text-[10px] text-gray-400">{new Date(n.created_at).toLocaleString()}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="dropdown-footer">
                      <button className="link cta" onClick={(e) => { e.stopPropagation(); window.location.href = '/bookings'; }}>
                        <BookOpenText size={16} className="inline mr-1" /> View all bookings
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Profile */}
              <div className="topbar-icon relative" ref={profileRef} onClick={toggleProfile} title="Profile">
                <span className="avatar">
                  <span className="avatar-initial">
                    {(adminUser?.full_name?.[0] || adminUser?.username?.[0] || 'A').toUpperCase()}
                  </span>
                </span>
                {profileOpen && (
                  <div className="dropdown-menu right">
                    <button className="dropdown-action danger" onClick={(e) => { e.stopPropagation(); handleLogout(); }}>
                      <LogOut size={16} className="inline mr-2" /> Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/rooms" element={<Rooms />} />
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/admin-management" element={isOwner ? <AdminManagement /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
    </div>
  );
}

export default App;
