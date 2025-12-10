import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

  const guestDataInit = [
    {
      checkInDate: 'Mar 28',
      checkInTime: '6:55:00 PM',
      checkOutDate: 'Mar 29',
      checkOutTime: '7:20 AM',
      name: '',
      company: '',
      email: '',
      contact: '',
      roomNo: '',
      days: '',
    pax: '',
    amount: '',
    remarks: 'Checked-Out',
    sector: 'BPO',
    purpose: 'holiday/rest/recreation',
    travel: 'Independent travel',
    frequency: 'First timer',
    gender: 'MALE',
    type: 'Domestic Guest',
    address: 'BENGUET',
    checkedInBy: 'RENDEL',
    checkedOutBy: 'MARYROSE',
    plateNo: ''
  },
  {
    checkInDate: 'Mar 28',
    checkInTime: '6:55:00 PM',
    checkOutDate: 'Mar 29',
    checkOutTime: '7:20 AM',
    name: '',
    company: '',
    email: '',
    contact: '',
    roomNo: '',
    days: '',
    pax: '',
    amount: '',
    remarks: 'Checked-Out',
    sector: 'CONSUMER GOOD',
    purpose: 'holiday/rest/recreation',
    travel: 'Bought package tour',
    frequency: 'First timer',
    gender: 'FEMALE',
    type: 'Domestic Guest',
    address: 'BENGUET',
    checkedInBy: 'RENDEL',
    checkedOutBy: 'MARYROSE',
    plateNo: ''
  },
  {
    checkInDate: 'Mar 28',
    checkInTime: '8:04:00 PM',
    checkOutDate: 'Mar 30',
    checkOutTime: '7:20 AM',
    name: '',
    company: '',
    email: '',
    contact: '',
    roomNo: '',
    days: '',
    pax: '',
    amount: '',
    remarks: 'Checked-Out',
    sector: 'TELECOM IT',
    purpose: 'Business & related business/trade',
    travel: 'Repeat visitors',
    frequency: 'Repeat visitors',
    gender: 'FEMALE',
    type: 'Domestic Guest',
    address: 'BAGUIO CITY',
    checkedInBy: 'RENDEL',
    checkedOutBy: 'MAYBELL',
    plateNo: ''
  },
  {
    checkInDate: 'Mar 30',
    checkInTime: '2:34:00 AM',
    checkOutDate: 'Apr 2',
    checkOutTime: '11:26 AM',
    name: '',
    company: '',
    email: '',
    contact: '9364257542',
    roomNo: '20',
    days: '3',
    pax: '7',
    amount: '9800',
    remarks: 'Checked-Out',
    sector: '',
    purpose: '',
    travel: '',
    frequency: '',
    gender: '',
    type: '',
    address: '',
    checkedInBy: '',
    checkedOutBy: '',
    plateNo: ''
  },
  {
    checkInDate: 'Mar 30',
    checkInTime: '12 nn',
    checkOutDate: 'Mar 30',
    checkOutTime: '',
    name: '',
    company: '',
    email: '',
    contact: '',
    roomNo: '21',
    days: '1',
    pax: '1',
    amount: '1500',
    remarks: 'Check -Inn',
    sector: '',
    purpose: '',
    travel: '',
    frequency: '',
    gender: '',
    type: '',
    address: '',
    checkedInBy: '',
    checkedOutBy: '',
    plateNo: ''
  },
];

const columns = [
  'Name', 'Email Address', 'Contact No.', 'Room No.', 'Check-in Date', 'Check-out Date', 
  'No. of Days', 'Amount', 'Plate No.', 'Checked-in By', 'Checked-out By', 'Remarks'
];

function Reports() {
  const [remarksFilter, setRemarksFilter] = useState('All');
  const [guestData, setGuestData] = useState(guestDataInit);
  const [showAdd, setShowAdd] = useState(false);
  const [newGuest, setNewGuest] = useState(() => Object.fromEntries(columns.map(col => [col.replace(/ |\//g, '').replace(/-/g, ''), ''])));
  const [search, setSearch] = useState('');
  const [detailRow, setDetailRow] = useState(null);
  const [editTimesRow, setEditTimesRow] = useState(null); // row being edited for times
  const [editTimes, setEditTimes] = useState({ inHM: '', outHM: '', inBy: '', outBy: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const normalize = (v = '') => String(v || '').toLowerCase();
  const isCheckedOut = (r) => normalize(r.remarks) === 'checked-out';
  const isCheckedIn = (r) => normalize(r.remarks) === 'checked-in';

  const totalRevenue = guestData.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const checkedInCount = guestData.filter(isCheckedIn).length;
  const checkedOutCount = guestData.filter(isCheckedOut).length;

  const matchesSearch = (row) => {
    const q = normalize(search);
    if (!q) return true;
    return [row.name, row.email, row.contact, row.roomNo, row.plateNo]
      .some(v => normalize(v).includes(q));
  };

  const filteredData = guestData
    .filter(row => (remarksFilter === 'All' ? true : row.remarks === remarksFilter))
    .filter(matchesSearch);
  const uniqueRemarks = Array.from(new Set(guestData.map(row => row.remarks)));

  // Export current filtered data to Excel (.xlsx)
  const handleExportExcel = async () => {
    try {
      // Dynamic import so the app still loads even if xlsx isn't installed yet
      const mod = await import('xlsx');
      const XLSX = mod && mod.default ? mod.default : mod; // support both ESM and CJS shapes
      // Map visible rows to a flat object with human-friendly headers
      const rows = filteredData.map((r) => ({
        'Check-in Date': r.checkInDate,
        'Check-in Time': r.checkInTime,
        'Check-out Date': r.checkOutDate,
        'Check-out Time': r.checkOutTime,
        'Name': r.name,
        'Company': r.company,
        'Email Address': r.email,
        'Contact No.': r.contact,
        'Room No.': r.roomNo,
        'No. of Days': r.days,
        'No. of Pax': r.pax,
        'Amount': r.amount,
        'Remarks': r.remarks,
        'Sector': r.sector,
        'Purpose of Visit': r.purpose,
        'Travel Arrangement': r.travel,
        'Frequency of Visit': r.frequency,
        'Gender': r.gender,
        'Type of Guest': r.type,
        'Address/Country': r.address,
        'Checked-in By': r.checkedInBy,
        'Checked-out By': r.checkedOutBy,
        'Plate No.': r.plateNo,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reports');
      const fileName = `reports_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e) {
      console.error('Export to Excel failed:', e);
      alert('Export failed. Please ensure the "xlsx" package is installed in admin frontend (npm i xlsx).');
    }
  };

  const handleAddGuest = () => {
    setGuestData([ { ...newGuest }, ...guestData ]);
    setShowAdd(false);
    setNewGuest(Object.fromEntries(columns.map(col => [col.replace(/ |\//g, '').replace(/-/g, ''), ''])));
  };

  // Map column names to object keys for newGuest
  const colToKey = col => col.replace(/ |\//g, '').replace(/-/g, '');

  const StatusChip = ({ remarks }) => {
    const r = normalize(remarks);
    if (r === 'checked-out') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-600/20 text-red-300 border border-red-500/40">Checked-Out</span>;
    if (r === 'checked-in' || r === 'confirmed') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-600/20 text-green-300 border border-green-500/40">Checked-In</span>;
    if (r === 'pending') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-400/40">Pending</span>;
    if (r === 'cancelled') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-600/20 text-rose-300 border border-rose-500/40">Cancelled</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-500/20 text-gray-300 border border-gray-400/40">Status</span>;
  };

  const Field = ({ label, value, icon }) => (
    <div className="flex items-center gap-1">
      {icon && <span className="opacity-80">{icon}</span>}
      <span className="text-gray-300 text-xs">{label}:</span>
      <span className="text-white text-sm font-medium">{value || '—'}</span>
    </div>
  );

  // Fetch real data from Supabase reservations
  useEffect(() => {
    let cancelled = false;
    const mapReservation = (r) => {
      const toDate = (iso) => {
        if (!iso) return { d: '', t: '' };
        const dt = new Date(iso);
        if (isNaN(dt)) return { d: '', t: '' };
        const d = dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
        const t = dt.toLocaleTimeString();
        return { d, t };
      };
      const ciISO = r.checkin_at || r.check_in || r.start_date || r.created_at || null;
      const coISO = r.checkout_at || r.check_out || r.end_date || null;
      const ci = toDate(ciISO);
      const co = toDate(coISO);
      const checkInField = (r.hasOwnProperty('checkin_at')) ? 'checkin_at'
        : (r.hasOwnProperty('check_in')) ? 'check_in'
        : (r.hasOwnProperty('start_date')) ? 'start_date'
        : undefined; // avoid editing created_at
      const checkOutField = (r.hasOwnProperty('checkout_at')) ? 'checkout_at'
        : (r.hasOwnProperty('check_out')) ? 'check_out'
        : (r.hasOwnProperty('end_date')) ? 'end_date'
        : undefined;
      // Map reservation.status exactly to reports remarks
      const statusRaw = (r.status || '').toString().toLowerCase();
      let remarks = 'Pending';
      if (statusRaw === 'pending') remarks = 'Pending';
      else if (statusRaw === 'confirmed') remarks = 'Checked-In';
      else if (statusRaw === 'checked out') remarks = 'Checked-Out';
      else if (statusRaw === 'cancelled') remarks = 'Cancelled';
      // Prefer joined customer profile fields when available
      const customer = r.customer || r.customer_profiles || null;
      return {
        _id: r.id,
        _ciISO: ciISO,
        _coISO: coISO,
        _checkInField: checkInField,
        _checkOutField: checkOutField,
        checkInDate: ci.d,
        checkInTime: ci.t,
        checkOutDate: co.d,
        checkOutTime: co.t,
        name: (customer?.full_name) || r.user_name || r.name || '',
        company: r.company || '',
        email: (customer?.email) || r.user_email || r.email || '',
        contact: (customer?.contact_number) || r.user_contact || r.contact || '',
        roomNo: r.room_name || r.room_no || r.room || '',
        days: r.nights || r.days || '',
        pax: r.guest_count || r.pax || r.guests || '',
        amount: r.total_amount || r.amount || r.price || '',
        remarks,
        sector: r.sector || '',
        purpose: r.purpose || '',
        travel: r.travel || '',
        frequency: r.frequency || '',
        gender: (customer?.gender) || r.gender || '',
        type: r.type || '',
        address: r.address || r.country || '',
        checkedInBy: r.checked_in_by || '',
        checkedOutBy: r.checked_out_by || '',
        plateNo: (customer?.plate_no) || r.plate_no || r.vehicle_plate || '',
      };
    };
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // First, try join to customer_profiles via customer_id (requires FK)
        let dataResp = await supabase
          .from('reservations')
          .select(`
            *,
            customer:customer_id (
              full_name,
              email,
              contact_number,
              gender,
              plate_no
            )
          `)
          .order('created_at', { ascending: false })
          .limit(200);

        // If relationship is missing, fall back to simple select
        if (dataResp.error && String(dataResp.error.message || '').includes('relationship')) {
          dataResp = await supabase
            .from('reservations')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
        }

        if (dataResp.error) throw dataResp.error;
        let data = dataResp.data || [];

        // If customer join did not populate, try to enrich by email and name (case-insensitive)
        const needsEnrich = Array.isArray(data) && data.some(r => !r.customer && (r.user_name || r.user_email || r.email));
        if (needsEnrich) {
          const norm = (s) => (s || '').toString().trim().toLowerCase();
          // Note: keys computed below were unused; removed to satisfy linter.

          // Fetch profiles once (cannot query ilike with IN across normalized), fetch all and map on client for robustness
          const profResp = await supabase
            .from('customer_profiles')
            .select('full_name,email,contact_number,gender,plate_no');

          if (!profResp.error && Array.isArray(profResp.data)) {
            const byName = new Map();
            const byEmail = new Map();
            for (const p of profResp.data) {
              const nk = norm(p.full_name);
              const ek = norm(p.email);
              if (nk && !byName.has(nk)) byName.set(nk, p);
              if (ek && !byEmail.has(ek)) byEmail.set(ek, p);
            }
            data = data.map(r => {
              const ck = r.customer;
              if (ck) return r;
              const hitByEmail = byEmail.get(norm(r.user_email || r.email));
              const hitByName = byName.get(norm(r.user_name));
              return { ...r, customer: hitByEmail || hitByName || null };
            });
          }
        }

        if (!cancelled && Array.isArray(data)) {
          setGuestData(data.map(mapReservation));
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load reports');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Reports</h2>
      {loading && (
        <div className="mb-3 text-sm text-gray-300">Loading reports...</div>
      )}

      {/* Edit Modal */}
      {editTimesRow && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white text-black rounded-lg p-6 w-full max-w-md relative">
            <button className="absolute top-2 right-4 text-2xl" onClick={() => setEditTimesRow(null)}>&times;</button>
            <h3 className="text-lg font-bold mb-4">Edit</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Checked-in By</label>
                <input type="text" className="border rounded px-2 py-1 w-full" value={editTimes.inBy} onChange={e => setEditTimes(v => ({ ...v, inBy: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Check-in Time</label>
                <input type="time" className="border rounded px-2 py-1 w-full" value={editTimes.inHM} onChange={e => setEditTimes(v => ({ ...v, inHM: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Check-out Time</label>
                <input type="time" className="border rounded px-2 py-1 w-full" value={editTimes.outHM} onChange={e => setEditTimes(v => ({ ...v, outHM: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Checked-out By</label>
                <input type="text" className="border rounded px-2 py-1 w-full" value={editTimes.outBy} onChange={e => setEditTimes(v => ({ ...v, outBy: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button className="bg-gray-400 px-4 py-2 rounded" onClick={() => setEditTimesRow(null)}>Cancel</button>
                <button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
                  onClick={async () => {
                    try {
                      const row = editTimesRow;
                      const updates = {};
                      const buildIso = (baseIso, hm) => {
                        if (!baseIso || !hm) return null;
                        const base = new Date(baseIso);
                        if (isNaN(base)) return null;
                        const [h, m] = hm.split(':').map(n => parseInt(n, 10));
                        const dt = new Date(base);
                        dt.setHours(h || 0, m || 0, 0, 0);
                        return dt.toISOString();
                      };
                      if (row._checkInField && editTimes.inHM) {
                        const v = buildIso(row._ciISO, editTimes.inHM);
                        if (v) updates[row._checkInField] = v;
                      }
                      if (row._checkOutField && editTimes.outHM) {
                        const v = buildIso(row._coISO, editTimes.outHM);
                        if (v) updates[row._checkOutField] = v;
                      }
                      // names can be updated regardless
                      updates.checked_in_by = editTimes.inBy ?? '';
                      updates.checked_out_by = editTimes.outBy ?? '';
                      if (!row._id || Object.keys(updates).length === 0) {
                        alert('Nothing to update.');
                        return;
                      }
                      const { error: upErr } = await supabase
                        .from('reservations')
                        .update(updates)
                        .eq('id', row._id);
                      if (upErr) throw upErr;
                      // reflect locally
                      setGuestData(prev => prev.map(r => {
                        if (r._id !== row._id) return r;
                        const toDateParts = (iso) => {
                          if (!iso) return { d: '', t: '' };
                          const dt = new Date(iso);
                          if (isNaN(dt)) return { d: '', t: '' };
                          const d = dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
                          const t = dt.toLocaleTimeString();
                          return { d, t };
                        };
                        const newCiISO = updates[row._checkInField] || r._ciISO;
                        const newCoISO = updates[row._checkOutField] || r._coISO;
                        const ci = toDateParts(newCiISO);
                        const co = toDateParts(newCoISO);
                        return { ...r, _ciISO: newCiISO, _coISO: newCoISO, checkInDate: ci.d, checkInTime: ci.t, checkOutDate: co.d, checkOutTime: co.t, checkedInBy: updates.checked_in_by, checkedOutBy: updates.checked_out_by };
                      }));
                      setEditTimesRow(null);
                    } catch (e) {
                      alert('Failed to update times: ' + (e.message || e));
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="mb-3 text-sm text-red-300">{error}</div>
      )}
      {/* Summary counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-[#232f47] p-3 flex items-center justify-between">
          <div className="text-sm text-gray-300">🟢 Checked-In</div>
          <div className="text-xl font-bold">{checkedInCount}</div>
        </div>
        <div className="rounded-lg bg-[#232f47] p-3 flex items-center justify-between">
          <div className="text-sm text-gray-300">🔴 Checked-Out</div>
          <div className="text-xl font-bold">{checkedOutCount}</div>
        </div>
        <div className="rounded-lg bg-[#232f47] p-3 flex items-center justify-between">
          <div className="text-sm text-gray-300">💰 Total Revenue</div>
          <div className="text-xl font-bold">₱{totalRevenue.toLocaleString()}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-col md:flex-row items-start md:items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="remarksFilter" className="font-semibold">Filter:</label>
          <select
            id="remarksFilter"
            className="px-2 py-1 rounded bg-[#232f47] text-white"
            value={remarksFilter}
            onChange={e => setRemarksFilter(e.target.value)}
          >
            <option value="All">All</option>
            {uniqueRemarks.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 w-full">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, contact, room, plate..."
            className="w-full md:w-96 bg-[#232f47] text-white rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
            title="Export visible rows to Excel"
          >
             Export to Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-w-full border border-[#232f47] rounded-lg">
        <table className="min-w-[1000px] w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#2a3350] text-white">
              <th className="px-3 py-2 text-left">Guest Info</th>
              <th className="px-3 py-2 text-left">Stay Details</th>
              <th className="px-3 py-2 text-left">Billing</th>
              <th className="px-3 py-2 text-left">Vehicle</th>
              <th className="px-3 py-2 text-left">Checked-in By</th>
              <th className="px-3 py-2 text-left">Checked-out By</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, i) => (
              <tr
                key={i}
                className={`${i % 2 === 0 ? 'bg-[#1E1E2F]' : 'bg-[#232336]'} hover:bg-[#2a2a40] transition`}
              >
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-col gap-1">
                    <Field label="Name" value={row.name} />
                    <Field label="Email" value={row.email} />
                    <Field label="Contact" value={row.contact} />
                    <Field label="Gender" value={row.gender} />
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-col gap-1">
                    <Field label="Room" value={row.roomNo} />
                    <Field label="Days" value={row.days} />
                    <Field label="Check-in" value={`${row.checkInDate} • ${row.checkInTime}`} />
                    <Field label="Check-out" value={`${row.checkOutDate} • ${row.checkOutTime}`} />
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-col gap-1">
                    <Field label="Amount" value={`₱${(Number(row.amount)||0).toLocaleString()}`} />
                    <Field label="Pax" value={row.pax} />
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <Field label="Plate No." value={row.plateNo} />
                </td>
                <td className="px-3 py-3 align-top"><span className="text-white">{row.checkedInBy || '—'}</span></td>
                <td className="px-3 py-3 align-top"><span className="text-white">{row.checkedOutBy || '—'}</span></td>
                <td className="px-3 py-3 align-top">
                  <StatusChip remarks={row.remarks} />
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm disabled:opacity-50"
                      onClick={() => {
                        const toHM = (iso) => {
                          if (!iso) return '';
                          const d = new Date(iso);
                          if (isNaN(d)) return '';
                          const hh = String(d.getHours()).padStart(2, '0');
                          const mm = String(d.getMinutes()).padStart(2, '0');
                          return `${hh}:${mm}`;
                        };
                        setEditTimesRow(row);
                        setEditTimes({ inHM: toHM(row._ciISO), outHM: toHM(row._coISO), inBy: row.checkedInBy || '', outBy: row.checkedOutBy || '' });
                      }}
                      disabled={!row._id || (!row._checkInField && !row._checkOutField)}
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>




      {/* Details Modal */}
      {false && detailRow && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setDetailRow(null)}>
          <div className="bg-[#1c2436] text-white rounded-lg p-6 w-full max-w-3xl relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button className="absolute top-2 right-4 text-2xl" onClick={() => setDetailRow(null)}>&times;</button>
            <h3 className="text-xl font-bold mb-4">Guest Details</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg bg-[#232f47] p-4">
                <div className="font-semibold mb-2">Guest Info</div>
                <div className="space-y-1 text-sm">
                  <Field label="Name" value={detailRow.name} />
                  <Field label="Email" value={detailRow.email} />
                  <Field label="Contact" value={detailRow.contact} />
                  <Field label="Gender" value={detailRow.gender} />
                </div>
              </div>
              <div className="rounded-lg bg-[#232f47] p-4">
                <div className="font-semibold mb-2">Stay Details</div>
                <div className="space-y-1 text-sm">
                  <Field label="Room No." value={detailRow.roomNo} />
                  <Field label="No. of Days" value={detailRow.days} />
                  <Field label="Check-in" value={`${detailRow.checkInDate} ${detailRow.checkInTime}`} />
                  <Field label="Check-out" value={`${detailRow.checkOutDate} ${detailRow.checkOutTime}`} />
                </div>
              </div>
              <div className="rounded-lg bg-[#232f47] p-4">
                <div className="font-semibold mb-2">Billing</div>
                <div className="space-y-1 text-sm">
                  <Field label="Amount" value={`₱${(Number(detailRow.amount)||0).toLocaleString()}`} />
                  <Field label="No. of Pax" value={detailRow.pax} />
                  <Field label="Status" value={detailRow.remarks} />
                </div>
              </div>
              <div className="rounded-lg bg-[#232f47] p-4">
                <div className="font-semibold mb-2">Vehicle</div>
                <div className="space-y-1 text-sm">
                  <Field label="Plate No." value={detailRow.plateNo} />
                </div>
              </div>
            </div>
            {/* Collapsible less important details */}
            <details className="mt-4">
              <summary className="cursor-pointer select-none">View Details</summary>
              <div className="grid md:grid-cols-2 gap-4 mt-3 text-sm">
                <Field label="Sector" value={detailRow.sector} />
                <Field label="Purpose of Visit" value={detailRow.purpose} />
                <Field label="Travel Arrangement" value={detailRow.travel} />
                <Field label="Frequency of Visit" value={detailRow.frequency} />
                <Field label="Type of Guest" value={detailRow.type} />
                <Field label="Address/Country" value={detailRow.address} />
                <Field label="Checked-in By" value={detailRow.checkedInBy} />
                <Field label="Checked-out By" value={detailRow.checkedOutBy} />
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;
