import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Profile.css";
import { supabase } from "../lib/supabase";


const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Form state
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    address: "",
    contact_number: "",
    gender: "",
    plate_no: ""
  });

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user'));
    if (!userData) {
      navigate('/login');
      return;
    }
    
    setUser(userData);
    setFormData({
      full_name: userData.full_name || "",
      email: userData.email || "",
      address: userData.address || "",
      contact_number: userData.contact_number || "",
      gender: userData.gender || "",
      plate_no: userData.plate_no || ""
    });
  }, [navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const emailLc = (formData.email || user.email || '').toLowerCase();
      let targetId = null;
      const { data: byEmail, error: byEmailErr } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('email', emailLc)
        .maybeSingle();
      if (!byEmailErr && byEmail?.id) targetId = byEmail.id;
      if (targetId) {
        const { error: upErr } = await supabase
          .from('customer_profiles')
          .update({ ...formData, email: emailLc })
          .eq('id', targetId);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase
          .from('customer_profiles')
          .insert([{ ...formData, email: emailLc, password: '' }]);
        if (insErr) throw insErr;
      }

      // Fallback: also notify backend API if needed
      try {
        await fetch(`http://localhost:4000/api/profile/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, email: emailLc })
        }).catch(() => {});
      } catch (_) {}

      const updatedUser = { ...user, ...formData };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to update profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset form to original user data
    setFormData({
      full_name: user?.full_name || "",
      email: user?.email || "",
      address: user?.address || "",
      contact_number: user?.contact_number || "",
      gender: user?.gender || "",
      plate_no: user?.plate_no || ""
    });
    setError("");
    setSuccess("");
  };

  if (!user) {
    return (
      <div className="profile-container">
        <div className="profile-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-content">
        <div className="profile-header">
          <button
            className="profile-back-btn"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
          <h1 className="profile-title">My Profile</h1>
          <p className="profile-subtitle">Manage your personal information and contact details</p>
        </div>

        <div className="profile-main">
          <div className="profile-form-container">
            <form onSubmit={handleSubmit} className="profile-form">
              {error && (
                <div className="profile-error">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}
              
              {success && (
                <div className="profile-success">
                  <span className="success-icon">✅</span>
                  {success}
                </div>
              )}

              <div className="form-section">
                <h3 className="form-section-title">Personal Information</h3>
                
                <div className="form-group">
                  <label htmlFor="full_name" className="form-label">
                    Full Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    className="form-input"
                    value={formData.full_name}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gender" className="form-label">
                    Gender
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    className="form-input"
                    value={formData.gender}
                    onChange={handleInputChange}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="email" className="form-label">
                    Email Address <span className="required">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className="form-input"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter your email address"
                  />
                </div>
              </div>

              <div className="form-section">
                <h3 className="form-section-title">Contact Information</h3>
                
                <div className="form-group">
                  <label htmlFor="address" className="form-label">
                    Address
                  </label>
                  <textarea
                    id="address"
                    name="address"
                    className="form-textarea"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter your complete address"
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contact_number" className="form-label">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    id="contact_number"
                    name="contact_number"
                    className="form-input"
                    value={formData.contact_number}
                    onChange={handleInputChange}
                    placeholder="Enter your contact number"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="plate_no" className="form-label">
                    Plate Number <span className="optional">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="plate_no"
                    name="plate_no"
                    className="form-input"
                    value={formData.plate_no}
                    onChange={handleInputChange}
                    placeholder="e.g. ABC-1234"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="profile-cancel-btn"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="profile-save-btn"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>

          <div className="profile-info">
            <div className="profile-card">
              <h3 className="profile-card-title">Profile Information</h3>
              <div className="profile-card-content">
                <div className="profile-info-item">
                  <span className="profile-info-label">Member Since:</span>
                  <span className="profile-info-value">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
                  </span>
                </div>
                <div className="profile-info-item">
                  <span className="profile-info-label">User ID:</span>
                  <span className="profile-info-value">{user.id}</span>
                </div>
                <div className="profile-info-item">
                  <span className="profile-info-label">Last Updated:</span>
                  <span className="profile-info-value">
                    {user.updated_at ? new Date(user.updated_at).toLocaleDateString() : "Never"}
                  </span>
                </div>
              </div>
            </div>

            <div className="profile-tips">
              <h4 className="tips-title">💡 Tips</h4>
              <ul className="tips-list">
                <li>Keep your contact information up to date for booking confirmations</li>
                <li>Your email address is used for login and notifications</li>
                <li>Address information helps us provide better service</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
