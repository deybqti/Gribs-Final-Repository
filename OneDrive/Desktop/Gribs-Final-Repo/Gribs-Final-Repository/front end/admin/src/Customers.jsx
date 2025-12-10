import React, { useEffect, useMemo, useState } from 'react';
import { customersApi } from './lib/supabase';
import './Bookings.css';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const list = await customersApi.getAllCustomers();
        setCustomers(Array.isArray(list) ? list : []);
        setError('');
      } catch (e) {
        setError(e.message || 'Failed to load customers');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (c.contact_number || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '—');
  const showAddress = useMemo(() => filtered.some((c) => typeof c.address !== 'undefined'), [filtered]);
  const showContact = useMemo(() => filtered.some((c) => typeof c.contact_number !== 'undefined'), [filtered]);
  const showUpdated = useMemo(() => filtered.some((c) => typeof c.updated_at !== 'undefined'), [filtered]);

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
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>
      </div>
    );
  }

  return (
    <div className="bookings-page">
      <div className="bookings-header">
        <h1 className="bookings-title">Customers</h1>
        <p className="bookings-subtitle">View registered customer accounts</p>
      </div>

      <div className="filters-card">
        <div className="filters-row">
          <div className="flex-1">
            <label className="form-label">Search</label>
            <input
              className="input-text"
              placeholder="Search by name, email, address, or contact number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bookings-card">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-300 text-lg">No customers found</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead className="thead">
                <tr>
                  <th className="th w-48">Full Name</th>
                  <th className="th w-64">Email</th>
                  {showAddress && <th className="th w-64">Address</th>}
                  {showContact && <th className="th w-40">Contact Number</th>}
                  <th className="th w-48">Date Created</th>
                  {showUpdated && <th className="th w-48">Date Updated</th>}
                </tr>
              </thead>
              <tbody className="tbody">
                {filtered.map((c) => (
                  <tr key={c.id} className="tr">
                    <td className="td w-48">{c.full_name || '—'}</td>
                    <td className="td w-64">{c.email || '—'}</td>
                    {showAddress && <td className="td w-64">{c.address || '—'}</td>}
                    {showContact && <td className="td w-40">{c.contact_number || '—'}</td>}
                    <td className="td w-48">{fmtDate(c.created_at)}</td>
                    {showUpdated && <td className="td w-48">{fmtDate(c.updated_at)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
