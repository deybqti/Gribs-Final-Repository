import React, { useState, useEffect } from 'react';
import { roomsApi } from './lib/supabase';

const amenitiesList = [
  "LUXURIOUS ORTHOPEDIC BED",
  "SPLIT-TYPE INVERTER AIRCON",
  "CABLE TV",
  "HOT AND COLD SHOWER",
  "FREE WI-FI",
  "COFFEE SET-UP WITH ELECTRIC KETTLE",
];

function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]); // for bulk actions
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ capacity: "", status: "" });
  const [sort, setSort] = useState({ field: "", direction: "asc" });
  const [normalizing, setNormalizing] = useState(false);
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [showDelete, setShowDelete] = useState(null);
  const [showBookings, setShowBookings] = useState(null);
  const [showGallery, setShowGallery] = useState(null);
  const [importModal, setImportModal] = useState(false);
  // Date range for availability preview (admin)
  const today = new Date();
  const toIsoDate = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
  const [startDate, setStartDate] = useState(() => toIsoDate(today));
  const [endDate, setEndDate] = useState(() => toIsoDate(new Date(today.getTime() + 24*60*60*1000)));
  const [availability, setAvailability] = useState({}); // { [room_name]: { capacity, reserved, available } }

  // Map old feature names to new standardized labels (component scope)
  const featureMap = {
    "Orthopedic Bed": "LUXURIOUS ORTHOPEDIC BED",
    "Split-Type Inverter Aircon": "SPLIT-TYPE INVERTER AIRCON",
    "Private Restroom with Hot and Cold Shower": "HOT AND COLD SHOWER",
    "Coffee set-up": "COFFEE SET-UP WITH ELECTRIC KETTLE",
    "Free Wi-Fi Access": "FREE WI-FI",
    "Smart TV": "CABLE TV",
    // Intentionally dropping Mini Bar and Sofa unless they already match new list
  };
  const allowedNew = new Set(amenitiesList);

  const normalizeFeatures = async () => {
    try {
      setNormalizing(true);
      const updated = [];
      for (const r of rooms) {
        const current = Array.isArray(r.features) ? r.features : [];
        // Map known old labels to new labels; drop anything not in allowed list
        const mapped = Array.from(new Set(
          current
            .map(f => featureMap[f] || f)
            .filter(f => allowedNew.has(f))
        ));
        // If nothing changes, skip
        const unchanged = mapped.length === current.length && mapped.every((v, i) => v === current[i]);
        if (!unchanged) {
          const nr = await roomsApi.updateRoom(r.id, { features: mapped });
          updated.push(nr);
        }
      }
      if (updated.length > 0) {
        setRooms(prev => prev.map(r => updated.find(u => u.id === r.id) || r));
      }
      alert(updated.length > 0 ? `Normalized features for ${updated.length} room(s).` : 'All rooms already use the new feature labels.');
    } catch (e) {
      console.error('Normalize features failed:', e);
      setError('Failed to normalize features.');
    } finally {
      setNormalizing(false);
    }
  };

  // Fetch rooms from Supabase
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        setLoading(true);
        const roomsData = await roomsApi.getAllRooms();
        setRooms(Array.isArray(roomsData) ? roomsData : []);
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

  // Fetch availability for selected dates
  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        if (!rooms || rooms.length === 0) { setAvailability({}); return; }
        const results = await Promise.all(
          rooms.map(async (r) => {
            try {
              const url = `http://localhost:4000/api/availability?room_name=${encodeURIComponent(r.name)}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`;
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
      } catch (_) {
        // ignore
      }
    };
    fetchAvailability();
  }, [rooms, startDate, endDate]);

  // Filter, search, sort logic
  let displayedRooms = rooms.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchesCapacity = !filter.capacity || Number(r.capacity) === Number(filter.capacity);
    const matchesStatus = !filter.status || r.status === filter.status;
    return matchesSearch && matchesCapacity && matchesStatus;
  });
  if (sort.field) {
    displayedRooms = [...displayedRooms].sort((a, b) => {
      let comparison = 0;
      if (sort.field === "price") {
        comparison = a.price - b.price;
      } else if (sort.field === "capacity") {
        comparison = a.capacity - b.capacity;
      } else if (sort.field === "name") {
        comparison = a.name.localeCompare(b.name);
      }
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }

  // Bulk actions
  const handleBulkDelete = async () => {
    try {
      // Delete each selected room
      for (const roomId of selected) {
        await roomsApi.deleteRoom(roomId);
      }
      setRooms(rooms.filter(r => !selected.includes(r.id)));
      setSelected([]);
    } catch (err) {
      console.error('Error deleting rooms:', err);
      setError('Failed to delete some rooms. Please try again.');
    }
  };

  // Add/Edit Room
    const handleSaveRoom = async (room) => {
      try {
        console.log('Saving room with data:', room);
        console.log('Room images:', room.images);
        if (editRoom) {
          const updatedRoom = await roomsApi.updateRoom(editRoom.id, room);
          console.log('Updated room:', updatedRoom);
          setRooms(rooms.map(r => r.id === editRoom.id ? updatedRoom : r));
        } else {
          const newRoom = await roomsApi.createRoom(room);
          console.log('Created room:', newRoom);
          setRooms([newRoom, ...rooms]);
        }
        setShowAddEdit(false);
        setEditRoom(null);
      } catch (err) {
        console.error('Error saving room:', err);
        setError('Failed to save room. Please try again.');
      }
    };

  // Export (CSV)
  const handleExport = () => {
    const csv = [
      ["Name", "Beds", "Capacity", "Price", "Available", "Occupied", "Reserved", "Maintenance"],
      ...rooms.map(r => [r.name, r.beds, r.capacity, r.price, r.available, r.occupied, r.reserved, r.maintenance ? "Yes" : "No"])
    ].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rooms.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Show loading state
  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">
          <div className="text-xl mb-4">Loading rooms...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="p-8">
        <div className="text-center">
          <div className="text-xl mb-4 text-red-600">Error: {error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Top bar: Add, Export, Import, Search, Filter, Sort, Bulk Actions */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded" onClick={() => { setShowAddEdit(true); setEditRoom(null); }}>Add Room</button>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded" onClick={handleExport}>Export CSV</button>
        <button className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded" onClick={() => setImportModal(true)}>Import</button>
        <input type="text" placeholder="Search rooms..." className="px-3 py-2 rounded bg-[#232f47] text-white" value={search} onChange={e => setSearch(e.target.value)} />
        <select 
          className="px-2 py-2 rounded bg-[#232f47] text-white" 
          value={filter.capacity} 
          onChange={e => setFilter(f => ({ ...f, capacity: e.target.value }))}
        >
          <option value="">All Capacities</option>
          {[...new Set(rooms.map(r => Number(r.capacity)))]
            .sort((a, b) => a - b)
            .map(c => (
              <option key={c} value={c}>
                {c} {c === 1 ? 'person' : 'people'}
              </option>
            ))}
        </select>
        <select className="px-2 py-2 rounded bg-[#232f47] text-white" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="maintenance">Maintenance</option>
          <option value="unavailable">Unavailable</option>
        </select>
        <div className="flex items-center gap-1">
          <select 
            className="px-2 py-2 rounded bg-[#232f47] text-white" 
            value={sort.field}
            onChange={e => setSort(prev => ({ ...prev, field: e.target.value }))}
          >
            <option value="">Sort By</option>
            <option value="name">Name</option>
            <option value="price">Price</option>
            <option value="capacity">Capacity</option>
          </select>
          {sort.field && (
            <button 
              className="px-2 py-2 rounded bg-[#2a3a5a] text-white hover:bg-[#3a4a6a]"
              onClick={() => setSort(prev => ({
                ...prev,
                direction: prev.direction === 'asc' ? 'desc' : 'asc'
              }))}
              title={sort.direction === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
            >
              {sort.direction === 'asc' ? '↑' : '↓'}
            </button>
          )}
        </div>
        {selected.length > 0 && (
          <>
            <span className="ml-4">Bulk Actions:</span>
            <button className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded" onClick={handleBulkDelete}>Delete Selected</button>
          </>
        )}
      </div>

      {/* Room Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedRooms.map((room) => (
          <div key={room.id} className={`bg-[#232f47] rounded-lg shadow-lg overflow-hidden flex flex-col relative ${room.maintenance ? 'opacity-60' : ''}`}>
            <input type="checkbox" className="absolute top-3 left-3 scale-125" checked={selected.includes(room.id)} onChange={e => setSelected(sel => e.target.checked ? [...sel, room.id] : sel.filter(id => id !== room.id))} />
            <img 
              src={
                (room.images && room.images.length > 0) ? room.images[0] : 
                room.image || 
                'https://via.placeholder.com/640x360?text=Room'
              } 
              alt={room.name} 
              className="h-48 w-full object-cover" 
              onClick={() => setShowGallery(room)}
              onLoad={() => {
                console.log('Image loaded successfully for room:', room.name);
              }}
              onError={(e) => {
                console.log('Image failed to load for room:', room.name, 'URL:', e.target.src);
                e.target.src = 'https://via.placeholder.com/640x360?text=Image+Not+Found';
              }}
            />
            <div className="p-5 flex-1 flex flex-col">
              <div className="font-bold text-xl mb-1">
                {room.name}
              </div>
              <div className="mb-2 flex gap-2 text-xs">
                <span className="bg-[#1f2a44] text-blue-200 px-2 py-1 rounded">👥 Capacity: {room.capacity}</span>
                <span className="bg-[#1f2a44] text-purple-200 px-2 py-1 rounded">🛏️ Beds: {room.beds}</span>
              </div>
              <div className="mb-2">
                <span className="font-semibold text-green-300">₱{room.price.toLocaleString()}</span>
                <span className="text-xs text-gray-400 ml-1">/ night</span>
              </div>
              {(() => {
                const a = availability[room.name];
                // If no availability data, show basic available count
                if (!a) {
                  const isAvailable = room.available > 0 && room.status !== 'occupied';
                  return (
                    <div className="mb-2 flex gap-2 text-xs">
                      <span className={`px-2 py-1 rounded ${isAvailable ? 'bg-green-700 text-green-100' : 'bg-red-600 text-white'}`}>
                        {isAvailable ? `Available: ${room.available}` : 'Unavailable'}
                      </span>
                    </div>
                  );
                }
                
                const reserved = Math.max(0, (a.capacity || 0) - (a.available || 0));
                const isAvailable = (a.available || 0) > 0 && room.status !== 'occupied';
                
                return (
                  <div className="mb-2 flex gap-2 text-xs items-center flex-wrap">
                    <span className="bg-[#1f2a44] text-blue-200 px-2 py-1 rounded">
                      {room.status === 'occupied' ? 'Occupied' : `Occupied: ${reserved}/${a.capacity || 0}`}
                    </span>
                    <span className={`${isAvailable ? 'bg-green-700 text-green-100' : 'bg-red-600 text-white'} px-2 py-1 rounded`}>
                      {isAvailable ? `Available: ${a.available}` : 'Unavailable'}
                    </span>
                  </div>
                );
              })()}
              <div className="mb-2">
                <div className="font-semibold text-sm mb-1">Features:</div>
                <ul className="list-disc list-inside text-xs text-gray-200">
                  {(room.features || []).map(f => <li key={f}>{f}</li>)}
                </ul>
              </div>
              <div className="mt-auto flex gap-2 flex-wrap">
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs" onClick={() => { setShowAddEdit(true); setEditRoom(room); }}>Edit</button>
                <button className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs" onClick={() => setShowDelete(room)}>Delete</button>
                <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-xs" onClick={() => setShowBookings(room)}>View Bookings</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Room Modal */}
      {showAddEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddEdit(false); setEditRoom(null); }}>
          <div className="bg-white text-black rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
            <button className="absolute top-2 right-4 text-2xl" onClick={() => { setShowAddEdit(false); setEditRoom(null); }}>&times;</button>
            <h2 className="text-xl font-bold mb-6">{editRoom ? 'Edit Room' : 'Add Room'}</h2>
            {/* Form fields */}
            <form onSubmit={e => { 
              e.preventDefault();
              const form = e.target;
              
              // Handle image input based on type
              const imageInput = form.image.value.trim();
              const imageType = form.imageType.value;
              let imageUrl = '';
              
              if (imageInput) {
                if (imageType === 'local') {
                  // Validate local image filename
                  if (!imageInput.match(/.*\.(png|jpg|jpeg|gif|webp)$/i)) {
                    setError('Please enter a valid image filename with extension (e.g., room1.png)');
                    return;
                  }
                  // Construct local image URL
                  imageUrl = `http://localhost:4000/images/rooms/${imageInput}`;
                } else {
                  // Validate external URL
                  if (!imageInput.match(/^https?:\/\/.+/)) {
                    setError('Please enter a valid image URL starting with http:// or https://');
                    return;
                  }
                  imageUrl = imageInput;
                }
              }
              
              const newRoom = {
                name: form.name.value,
                beds: form.beds.value,
                capacity: form.capacity.value,
                price: Number(form.price.value),
                available: Number(form.available.value),
                // Occupied and Reserved are no longer editable in the form;
                // preserve existing values when editing, otherwise default to 0
                occupied: editRoom?.occupied ?? 0,
                reserved: editRoom?.reserved ?? 0,
                maintenance: form.maintenance.checked,
                features: Array.from(form.features).filter(f => f.checked).map(f => f.value),
                images: imageUrl ? [imageUrl] : [],
                status: 'available'
              };
              handleSaveRoom(newRoom);
            }}>
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Room Name *</label>
                  <input name="name" defaultValue={editRoom?.name || ''} placeholder="Room Name" className="border p-2 rounded w-full" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Beds *</label>
                  <input name="beds" defaultValue={editRoom?.beds || ''} placeholder="Beds" className="border p-2 rounded w-full" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity *</label>
                  <input name="capacity" defaultValue={editRoom?.capacity || ''} placeholder="Capacity" className="border p-2 rounded w-full" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
                  <input name="price" type="number" defaultValue={editRoom?.price || ''} placeholder="Price" className="border p-2 rounded w-full" required />
                </div>
              </div>

              {/* Availability */}
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Available</label>
                  <input name="available" type="number" defaultValue={editRoom?.available || 0} placeholder="Available" className="border p-2 rounded w-full" required />
                </div>
              </div>

              {/* Maintenance Status */}
              <div className="flex items-center mb-6">
                <input name="maintenance" type="checkbox" defaultChecked={editRoom?.maintenance} className="mr-2" />
                <span className="text-sm font-medium text-gray-700">Under Maintenance</span>
              </div>
              {/* Amenities */}
              <div className="mb-6">
                <div className="font-semibold text-sm mb-3 text-gray-700">Amenities:</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {amenitiesList.map(a => (
                    <label key={a} className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50">
                      <input type="checkbox" name="features" value={a} defaultChecked={editRoom?.features?.includes(a)} />
                      <span className="text-sm">{a}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* Image Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Room Image *</label>
                <div className="text-xs text-gray-500 mb-3 p-3 bg-gray-50 rounded">
                  <strong>Local Images:</strong> Place images in <code>front end/rooms/</code> folder and enter filename (e.g., room1.png)<br/>
                  <strong>External URLs:</strong> Enter full URL (e.g., https://example.com/image.jpg)
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Image Source:</label>
                    <select 
                      name="imageType" 
                      className="border p-2 rounded w-full"
                      defaultValue={
                        editRoom?.images?.[0] && editRoom.images[0].includes('localhost:4000/images/rooms/') ? 
                          'local' : 
                          'url'
                      }
                      onChange={(e) => {
                        const imageInput = document.querySelector('input[name="image"]');
                        const preview = document.getElementById('image-preview');
                        if (e.target.value === 'local') {
                          imageInput.placeholder = 'Image filename (e.g., room1.png)';
                        } else {
                          imageInput.placeholder = 'Image URL (e.g., https://example.com/image.jpg)';
                        }
                        imageInput.removeAttribute('pattern');
                        imageInput.removeAttribute('title');
                        imageInput.value = '';
                        if (preview) {
                          preview.src = '';
                          document.getElementById('image-preview-container').style.display = 'none';
                        }
                      }}
                    >
                      <option value="local">Local Image (from rooms folder)</option>
                      <option value="url">External URL</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Image Path/URL:</label>
                    <input 
                      name="image" 
                      defaultValue={
                        editRoom?.images?.[0] ? 
                          (editRoom.images[0].includes('localhost:4000/images/rooms/') ? 
                            editRoom.images[0].split('/').pop() : 
                            editRoom.images[0]) : 
                          ''
                      } 
                      placeholder="Image filename (e.g., room1.png)" 
                      className="border p-2 rounded w-full" 
                      required 
                      onChange={(e) => {
                        const url = e.target.value.trim();
                        const imageType = document.querySelector('select[name="imageType"]').value;
                        const preview = document.getElementById('image-preview');
                        
                        if (url) {
                          let fullUrl;
                          if (imageType === 'local') {
                            // For local images, construct the URL
                            fullUrl = `http://localhost:4000/images/rooms/${url}`;
                          } else {
                            // For external URLs, use as-is
                            fullUrl = url;
                          }
                          
                          if (preview) {
                            preview.src = fullUrl;
                            preview.style.display = 'block';
                          }
                        }
                      }}
                    />
                  </div>
                </div>
                
                <div id="image-preview-container" className="mt-4" style={{ display: 'none' }}>
                  <div className="text-sm font-medium text-gray-700 mb-2">Preview:</div>
                  <img 
                    id="image-preview" 
                    src="" 
                    alt="Preview of selected room" 
                    className="w-full h-48 object-cover rounded border"
                    onLoad={() => {
                      document.getElementById('image-preview-container').style.display = 'block';
                    }}
                    onError={() => {
                      document.getElementById('image-preview-container').style.display = 'none';
                    }}
                  />
                </div>
              </div>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded w-full">Save</button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setShowDelete(null)}>
          <div className="bg-white text-black rounded-lg p-8 w-full max-w-md relative" onClick={e => e.stopPropagation()}>
            <button className="absolute top-2 right-4 text-2xl" onClick={() => setShowDelete(null)}>&times;</button>
            <h2 className="text-xl font-bold mb-4">Delete Room</h2>
            <p>Are you sure you want to delete <b>{showDelete.name}</b>?</p>
            <div className="flex gap-4 mt-6">
              <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded" onClick={async () => { 
                try {
                  await roomsApi.deleteRoom(showDelete.id);
                  setRooms(rooms.filter(r => r.id !== showDelete.id));
                  setShowDelete(null);
                } catch (err) {
                  console.error('Error deleting room:', err);
                  setError('Failed to delete room. Please try again.');
                }
              }}>Delete</button>
              <button className="bg-gray-400 px-4 py-2 rounded" onClick={() => setShowDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Booking History Modal */}
      {showBookings && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setShowBookings(null)}>
          <div className="bg-white text-black rounded-lg p-8 w-full max-w-md relative" onClick={e => e.stopPropagation()}>
            <button className="absolute top-2 right-4 text-2xl" onClick={() => setShowBookings(null)}>&times;</button>
            <h2 className="text-xl font-bold mb-4">Booking History for {showBookings.name}</h2>
            {showBookings.bookings.length === 0 ? <p>No bookings yet.</p> : (
              <ul className="list-disc list-inside">
                {showBookings.bookings.map((b, i) => <li key={i}>{b.guest} - {b.date}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Image Gallery Modal */}
      {showGallery && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={() => setShowGallery(null)}>
          <div className="bg-white text-black rounded-lg p-8 w-full max-w-2xl relative" onClick={e => e.stopPropagation()}>
            <button className="absolute top-2 right-4 text-2xl" onClick={() => setShowGallery(null)}>&times;</button>
            <h2 className="text-xl font-bold mb-4">Images for {showGallery.name}</h2>
            <div className="flex gap-4 flex-wrap">
              {showGallery.images.map((img, i) => (
                <img key={i} src={img} alt={showGallery.name + i} className="h-40 w-60 object-cover rounded" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Import Modal (placeholder) */}
      {importModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setImportModal(false)}>
          <div className="bg-white text-black rounded-lg p-8 w-full max-w-md relative" onClick={e => e.stopPropagation()}>
            <button className="absolute top-2 right-4 text-2xl" onClick={() => setImportModal(false)}>&times;</button>
            <h2 className="text-xl font-bold mb-4">Import Rooms (CSV)</h2>
            <p className="mb-4">This is a placeholder for CSV import functionality.</p>
            <input type="file" className="mb-4" />
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded w-full" onClick={() => setImportModal(false)}>Import</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Rooms; 