import React, { useEffect, useMemo, useState } from 'react';
import { dashboardApi, supabase } from './lib/supabase';
import { LogIn, LogOut, Home, DollarSign } from 'lucide-react';
import './Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState({
    todayCheckIns: 0,
    todayCheckOuts: 0,
    totalAvailableRooms: 0,
    totalOccupiedRooms: 0,
    checkInChange: '+0',
    checkOutChange: '+0',
    availableChange: '0',
    occupiedChange: '0',
  });
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [calMonthCursor, setCalMonthCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState(null);
  const [calDayCounts, setCalDayCounts] = useState({});
  const [calDayBookings, setCalDayBookings] = useState({});
  const [calSelectedDateKey, setCalSelectedDateKey] = useState(null);
  const calYear = calMonthCursor.getFullYear();
  const calMonth = calMonthCursor.getMonth();
  const calStartOfMonth = useMemo(() => new Date(calYear, calMonth, 1), [calYear, calMonth]);
  const calEndOfMonth = useMemo(() => new Date(calYear, calMonth + 1, 0, 23, 59, 59, 999), [calYear, calMonth]);
  const calTotalRooms = 10;
  const calFormatKey = (d) => { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; };
  const calBuildMonthDays = () => { const firstWeekday = calStartOfMonth.getDay(); const daysInMonth = calEndOfMonth.getDate(); const days = []; for (let i = 0; i < firstWeekday; i++) days.push(null); for (let d = 1; d <= daysInMonth; d++) days.push(new Date(calYear, calMonth, d)); return days; };
  const calMonthDays = useMemo(calBuildMonthDays, [calYear, calMonth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCalLoading(true);
        setCalError(null);
        const startISO = new Date(calYear, calMonth, 1).toISOString();
        const endISO = new Date(calYear, calMonth + 1, 0, 23, 59, 59, 999).toISOString();
        const { data, error } = await supabase.from('reservations').select('*').order('created_at', { ascending: false }).limit(1000);
        if (error) throw error;
        const toISO = (r) => ({ ci: r.checkin_at || r.check_in || r.start_date || r.created_at || null, co: r.checkout_at || r.check_out || r.end_date || null });
        const overlaps = (ciISO, coISO, rsISO, reISO) => { if (!ciISO && !coISO) return false; const ci = ciISO ? new Date(ciISO) : null; const co = coISO ? new Date(coISO) : null; const rs = new Date(rsISO); const re = new Date(reISO); if (ci && !co) return ci <= re; if (!ci && co) return co >= rs; if (!ci && !co) return false; return ci <= re && co >= rs; };
        const monthBookings = (data || []).filter(r => { const { ci, co } = toISO(r); return overlaps(ci, co, startISO, endISO); });
        const counts = {}; const buckets = {}; const pushBooking = (key, booking) => { if (!buckets[key]) buckets[key] = []; buckets[key].push(booking); };
        for (const r of monthBookings) {
          const iso = toISO(r); const ciISO = iso.ci; const coISO = iso.co; const start = ciISO ? new Date(ciISO) : calStartOfMonth; const end = coISO ? new Date(coISO) : calEndOfMonth; const s = new Date(Math.max(start.getTime(), calStartOfMonth.getTime())); const e = new Date(Math.min(end.getTime(), calEndOfMonth.getTime())); const status = (r.status || '').toString().toLowerCase(); const countsTowardOccupancy = !(status === 'cancelled' || status === 'rejected');
          for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
            const key = calFormatKey(d);
            if (countsTowardOccupancy) { counts[key] = (counts[key] || 0) + 1; }
            pushBooking(key, { id: r.id, guest: r.user_name || r.name || r.customer_name || 'Guest', room: r.room_name || r.room_no || r.room || 'Room', status: r.status || '—' });
          }
        }
        if (!cancelled) { setCalDayCounts(counts); setCalDayBookings(buckets); }
      } catch (e) {
        if (!cancelled) setCalError(e.message || 'Failed to load calendar');
      } finally {
        if (!cancelled) setCalLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [calYear, calMonth, calStartOfMonth, calEndOfMonth]);

  

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsData, roomsData] = await Promise.all([
          dashboardApi.getDashboardStats(),
          dashboardApi.getDashboardRooms(),
        ]);
        setStats(statsData);
        setRooms(roomsData);
        setError(null);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();

    // Refresh data every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  

  if (loading) {
    return (
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-main">
      {/* Overview Cards */}
      <section className="mb-8">
        <div className="section-header">
          <h2 className="section-title">Overview</h2>
        </div>
        <div className="overview-grid">
          {[
            { 
              title: "Today's Check-in", 
              value: stats.todayCheckIns, 
              change: `${stats.checkInChange} from yesterday`, 
              icon: <LogIn size={24} className="text-blue-500" /> 
            },
            { 
              title: "Today's Check-out", 
              value: stats.todayCheckOuts, 
              change: `${stats.checkOutChange} from yesterday`, 
              icon: <LogOut size={24} className="text-blue-500" /> 
            },
            { 
              title: 'Total Available Rooms', 
              value: stats.totalAvailableRooms, 
              change: `${stats.availableChange} since yesterday`, 
              icon: <Home size={24} className="text-green-500" /> 
            },
            { 
              title: 'Total Occupied Rooms', 
              value: stats.totalOccupiedRooms, 
              change: `${stats.occupiedChange} since yesterday`, 
              icon: <Home size={24} className="text-amber-500" /> 
            },
            { 
              title: 'Total Revenue', 
              value: `₱${(stats.totalRevenue || 0).toLocaleString()}`, 
              change: 'from confirmed bookings', 
              icon: <DollarSign size={24} className="text-emerald-500" /> 
            },
          ].map((card, idx) => (
            <div key={idx} className="overview-card">
              <div className="card-row">
                <span className="card-title">{card.title}</span>
                <div className="card-icon flex items-center justify-center">
                  {card.icon}
                </div>
              </div>
              <div className="card-value">{card.value}</div>
              <div className="card-change">{card.change}</div>
            </div>
          ))}
        </div>
      </section>

      

      

      <section className="dashboard-row">
        <div className="chart-wrap">
        {(() => {
          const total = (stats.totalAvailableRooms || 0) + (stats.totalOccupiedRooms || 0);
          if (total === 0) {
            return (
              <div className="text-center text-gray-400">No room data</div>
            );
          }
          const occupied = stats.totalOccupiedRooms || 0;
          const available = stats.totalAvailableRooms || 0;
          const occupiedPct = Math.round((occupied / total) * 100);
          const availablePct = 100 - occupiedPct;
          const size = 180;
          const chartStyle = {
            width: size,
            height: size,
            borderRadius: '50%',
            background: `conic-gradient(#ef4444 0% ${occupiedPct}%, #10b981 ${occupiedPct}% 100%)`,
            display: 'grid',
            placeItems: 'center'
          };
          return (
            <div className="flex items-center gap-8">
              <div style={chartStyle}>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }}></span>
                    <span className="text-sm font-semibold" style={{ color: '#ef4444' }}>Occupied</span>
                  </div>
                  <div className="text-xl font-bold" style={{ color: '#ef4444' }}>{occupiedPct}%</div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: '#ef4444' }}></span>
                  <span>Occupied: {occupied} / {total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: '#10b981' }}></span>
                  <span>Not occupied: {available} / {total}</span>
                </div>
                
              </div>
            </div>
          );
        })()}
        </div>

        <div className="calendar-panel">
          <div className="flex justify-between items-center mb-2">
            <button className="calendar-nav-btn" onClick={() => setCalMonthCursor(new Date(calYear, calMonth - 1, 1))}>&lt;</button>
            <span className="calendar-title">{calMonthCursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</span>
            <button className="calendar-nav-btn" onClick={() => setCalMonthCursor(new Date(calYear, calMonth + 1, 1))}>&gt;</button>
          </div>
          {calError && <div className="mb-3 text-sm text-red-300">{calError}</div>}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="calendar-weekday">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calMonthDays.map((d, idx) => {
              if (!d) return <div key={`b-${idx}`} className="h-20 rounded bg-[#1a253a]" style={{ opacity: 0 }} />;
              const key = calFormatKey(d);
              const booked = calDayCounts[key] || 0;
              const cap = calTotalRooms || 1;
              const pct = Math.min(1, booked / cap);
              const fillColor = pct <= 0.3 ? '#10b981' : pct <= 0.7 ? '#f59e0b' : '#ef4444';
              return (
                <button
                  key={key}
                  className="calendar-cell"
                  onClick={() => setCalSelectedDateKey(key)}
                >
                  <div className="text-sm font-semibold">{d.getDate()}</div>
                  <div className="meta">{booked}/{cap} Booked</div>
                  <div className="progress">
                    <div className="progress-fill" style={{ width: `${Math.round(pct*100)}%`, backgroundColor: fillColor }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      {calSelectedDateKey && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCalSelectedDateKey(null)}>
            <div className="bg-white text-black rounded-lg w-full max-w-xl p-6 relative" onClick={e => e.stopPropagation()}>
              <button className="absolute right-4 top-2 text-2xl" onClick={() => setCalSelectedDateKey(null)}>&times;</button>
              <h3 className="text-lg font-bold mb-2">Bookings on {calSelectedDateKey}</h3>
              {calLoading ? (
                <div className="text-sm text-gray-600">Loading...</div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {(calDayBookings[calSelectedDateKey] || []).length === 0 ? (
                    <div className="text-sm text-gray-600">No bookings for this date.</div>
                  ) : (
                    (calDayBookings[calSelectedDateKey] || [])
                      .slice()
                      .sort((a, b) => { const pri = (s) => { s = (s || '').toString().toLowerCase(); if (s.includes('confirmed') || s.includes('checked-in')) return 0; if (s.includes('paid') || s.includes('reserved')) return 1; if (s.includes('checked out')) return 2; if (s.includes('pending')) return 3; if (s.includes('rejected') || s.includes('cancelled')) return 4; return 5; }; return pri(a.status) - pri(b.status); })
                      .map((b) => {
                        const status = (b.status || '—').toString();
                        const s = status.toLowerCase();
                        const isCheckedOut = s.includes('checked out') || s.includes('checked-out') || s.includes('checkedout');
                        const cls = s.includes('cancel') || s.includes('reject')
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : isCheckedOut
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : s.includes('pending')
                          ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                          : 'bg-green-100 text-green-700 border border-green-200';
                        const label = status.charAt(0).toUpperCase() + status.slice(1);
                        return (
                          <div key={b.id} className="border rounded px-3 py-2 flex items-center justify-between bg-white">
                            <div>
                              <div className="font-semibold text-sm">{b.guest || 'Guest'}</div>
                              <div className="text-xs text-gray-600">Room: {b.room || '—'}</div>
                            </div>
                            <div className={`text-xs px-2 py-1 rounded ${cls}`}>{label}</div>
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>
          </div>
        )}
    </main>
  );
}

export default Dashboard;
