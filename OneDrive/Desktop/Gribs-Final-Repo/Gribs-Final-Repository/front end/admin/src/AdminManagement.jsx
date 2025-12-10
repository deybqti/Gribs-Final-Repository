import React, { useState, useEffect } from 'react';
import { supabase, adminAuth } from './lib/supabase';
import bcrypt from 'bcryptjs';

const useAdminManagement = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load admins from Supabase
  const loadAdmins = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('admin_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setAdmins(data || []);
    } catch (err) {
      console.error('Error loading admins:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load admins on component mount
  useEffect(() => {
    loadAdmins();
  }, []);

  // Hash password with bcrypt
  const hashPassword = async (password) => {
    const saltRounds = 10; // Cost factor for hashing
    try {
      const salt = await bcrypt.genSalt(saltRounds);
      const hash = await bcrypt.hash(password, salt);
      return hash;
    } catch (err) {
      console.error('Error hashing password:', err);
      throw new Error('Failed to secure password');
    }
  };

  const createAdmin = async (adminData) => {
    try {
      setLoading(true);
      console.log('Creating admin with data:', { 
        username: adminData.username,
        fullName: adminData.fullName,
        passwordLength: adminData.password?.length || 0
      });
      
      // Check if admin already exists
      const { data: existingAdmin, error: checkError } = await supabase
        .from('admin_profiles')
        .select('username')
        .eq('username', adminData.username)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking existing admin:', checkError);
        throw new Error(`Error checking username: ${checkError.message}`);
      }
      
      if (existingAdmin) {
        throw new Error('Admin with this username already exists');
      }

      // Hash the password before storing
      const hashedPassword = await hashPassword(adminData.password);

      // Create new admin in Supabase
      const { data: newAdmin, error: createError } = await supabase
        .from('admin_profiles')
        .insert([
          {
            username: adminData.username,
            password: hashedPassword, // Store hashed password
            full_name: adminData.fullName,
            role: adminData.role || 'admin',
            created_at: new Date().toISOString()
          }
        ])
        .select('*')
        .single();

      if (createError) {
        console.error('Supabase create error:', createError);
        throw new Error(`Failed to create admin: ${createError.message}`);
      }
      
      if (!newAdmin) {
        console.error('No data returned from insert operation');
        throw new Error('No data returned from the server');
      }
      
      console.log('Admin created successfully:', newAdmin);
      
      // Update local state
      setAdmins(prev => [newAdmin, ...prev]);
      return newAdmin;
    } catch (err) {
      console.error('Error creating admin:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const adminExists = async (username) => {
    const { data } = await supabase
      .from('admin_profiles')
      .select('username')
      .eq('username', username)
      .single();
    
    return !!data;
  };

  const resetPassword = async (adminId, newPassword) => {
    try {
      setLoading(true);
      
      // Hash the new password before updating
      const hashedPassword = await hashPassword(newPassword);
      
      const { data, error } = await supabase
        .from('admin_profiles')
        .update({ 
          password: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', adminId)
        .select()
        .single();

      if (error) throw error;
      
      // Refresh the admin list
      await loadAdmins();
      
      return { success: true, data };
    } catch (err) {
      console.error('Error resetting password:', err);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return { admins, createAdmin, adminExists, resetPassword, loading, error };
};

const AdminManagement = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    password: '',
    role: 'admin' // Default to 'admin' for security
  });
  const [_, setIsSubmitting] = useState(false); // Keep for future use
  const [message, setMessage] = useState({ text: '', type: '' });
  const [resetPasswordData, setResetPasswordData] = useState({
    showModal: false,
    adminId: null,
    adminName: '',
    newPassword: '',
    confirmPassword: '',
    isResetting: false,
    error: ''
  });
  const [adminList, setAdminList] = useState([]);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  
  const { createAdmin, adminExists, resetPassword, admins, loading } = useAdminManagement();
  
  // Get current admin user
  useEffect(() => {
    const admin = adminAuth.getUser();
    setCurrentAdmin(admin);
  }, []);
  
  const isOwner = currentAdmin?.role === 'owner' || currentAdmin?.username === 'owner';
  
  // Load admins when the component mounts
  useEffect(() => {
    if (admins.length > 0) {
      setAdminList(admins);
    }
  }, [admins]);
  
  // Reset password handlers
  const handleOpenResetPassword = (admin) => {
    setResetPasswordData({
      showModal: true,
      adminId: admin.id,
      adminName: admin.full_name || admin.username,
      newPassword: '',
      confirmPassword: '',
      isResetting: false,
      error: ''
    });
  };
  
  const handleCloseResetPassword = () => {
    setResetPasswordData({
      showModal: false,
      adminId: null,
      adminName: '',
      newPassword: '',
      confirmPassword: '',
      isResetting: false,
      error: ''
    });
  };
  
  const handleResetPasswordChange = (e) => {
    const { name, value } = e.target;
    setResetPasswordData(prev => ({
      ...prev,
      [name]: value,
      error: '' // Clear error when user types
    }));
  };
  
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    
    // Validate passwords
    if (resetPasswordData.newPassword.length < 6) {
      setResetPasswordData(prev => ({
        ...prev,
        error: 'Password must be at least 6 characters long'
      }));
      return;
    }
    
    if (resetPasswordData.newPassword !== resetPasswordData.confirmPassword) {
      setResetPasswordData(prev => ({
        ...prev,
        error: 'Passwords do not match'
      }));
      return;
    }
    
    try {
      setResetPasswordData(prev => ({ ...prev, isResetting: true, error: '' }));
      
      // Call the resetPassword function
      const { success, error } = await resetPassword(
        resetPasswordData.adminId,
        resetPasswordData.newPassword
      );
      
      if (success) {
        setMessage({
          text: `✅ Password for ${resetPasswordData.adminName} has been reset successfully!`,
          type: 'success'
        });
        handleCloseResetPassword();
      } else {
        throw new Error(error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      setResetPasswordData(prev => ({
        ...prev,
        error: error.message || 'Failed to reset password. Please try again.'
      }));
    } finally {
      setResetPasswordData(prev => ({ ...prev, isResetting: false }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Form submitted');
    setIsSubmitting(true);
    setMessage({ text: '', type: '' });

    try {
      console.log('Form data:', formData);
      // Simple validation
      if (!formData.fullName || !formData.username || !formData.password) {
        throw new Error('All fields are required');
      }

      if (formData.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      // Check if admin already exists
      const exists = await adminExists(formData.username);
      if (exists) {
        throw new Error('Username already exists');
      }

      // Create admin in Supabase
      await createAdmin(formData);
      
      setMessage({
        text: `✅ Admin account for ${formData.fullName} created successfully!`,
        type: 'success'
      });
      
      // Reset form
      setFormData({
        fullName: '',
        username: '',
        password: '',
        role: 'admin' // Reset to default
      });
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      const errorMessage = error.message || 'Failed to create admin account';
      console.log('Setting error message:', errorMessage);
      setMessage({
        text: errorMessage,
        type: 'error'
      });
    } finally {
      console.log('Form submission completed');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      {/* Reset Password Modal */}
      {resetPasswordData.showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 p-6 rounded-t-xl">
              <h3 className="text-xl font-bold text-white">Reset Password</h3>
              <p className="text-yellow-100 text-sm">Set a new password for {resetPasswordData.adminName}</p>
            </div>
            
            <form onSubmit={handleResetPasswordSubmit} className="p-6">
              {resetPasswordData.error && (
                <div className="mb-4 p-3 bg-red-900/50 text-red-100 border-l-4 border-red-500 rounded">
                  {resetPasswordData.error}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    value={resetPasswordData.newPassword}
                    onChange={handleResetPasswordChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    placeholder="Enter new password"
                    required
                    minLength={6}
                  />
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={resetPasswordData.confirmPassword}
                    onChange={handleResetPasswordChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    placeholder="Confirm new password"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCloseResetPassword}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  disabled={resetPasswordData.isResetting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors flex items-center"
                  disabled={resetPasswordData.isResetting}
                >
                  {resetPasswordData.isResetting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Resetting...
                    </>
                  ) : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Admin List */}
        <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
          <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 p-6">
            <h2 className="text-2xl font-bold text-white">Admin Accounts</h2>
            <p className="text-yellow-100 text-sm mt-1">Manage administrator accounts and permissions</p>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
              </div>
            ) : adminList.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No admin accounts found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Username</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Role</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {adminList.map((admin) => (
                      <tr key={admin.id} className="hover:bg-gray-750">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div>
                              <div className="text-sm font-medium text-white">{admin.full_name || 'N/A'}</div>
                              <div className="text-xs text-gray-400">
                                {new Date(admin.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300">{admin.username}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            admin.role === 'owner' 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {admin.role === 'owner' ? 'Owner' : 'Admin'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                          {isOwner && (
                            <button
                              onClick={() => handleOpenResetPassword(admin)}
                              className="text-yellow-500 hover:text-yellow-400 mr-4"
                              title="Reset Password"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Create Admin Form */}
        <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
          <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 p-6">
            <h2 className="text-2xl font-bold text-white">Create New Admin Account</h2>
            <p className="text-yellow-100 text-sm mt-1">Add new administrators to manage the hotel system</p>
          </div>
        
        <div className="p-6">
          {message.text && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === 'success' 
                ? 'bg-green-900/50 text-green-100 border-l-4 border-green-500' 
                : 'bg-red-900/50 text-red-100 border-l-4 border-red-500'
            }`}>
              <div className="flex items-center">
                <span className="mr-2">
                  {message.type === 'success' ? '✓' : '⚠'}
                </span>
                <span>{message.text}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-300">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="bg-gray-700 text-white focus:ring-yellow-500 focus:border-yellow-500 block w-full pl-10 pr-3 py-2 sm:text-sm border-gray-600 rounded-md border"
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5 8a1 1 0 011-1h1V6a1 1 0 012 0v1h1a1 1 0 110 2H9v1a1 1 0 11-2 0V9H6a1 1 0 01-1-1z" />
                    <path fillRule="evenodd" d="M2 12c0-3.517 3.022-6.354 6.5-6.354s6.5 2.837 6.5 6.354c0 1.5-.5 2.5-1.5 3.5s-2 1.5-3 1.5c-1.5 0-3-0.5-4.5-1.5s-2-2-2.5-3.5zM14.5 12c0-3.314-2.462-6-5.5-6s-5.5 2.686-5.5 6c0 1.5 0.5 2 1 2.5s1.5 1 2.5 1c1.5 0 3-0.5 4.5-1.5s1.5-1.5 2-2.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="bg-gray-700 text-white focus:ring-yellow-500 focus:border-yellow-500 block w-full pl-10 pr-3 py-2 sm:text-sm border-gray-600 rounded-md border"
                  placeholder="johndoe"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                placeholder="Enter a strong password"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="role" className="block text-sm font-medium text-gray-300">
                Role
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                required
              >
                <option value="admin">Admin (Front Desk)</option>
                <option value="owner">Owner (Full Access)</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">
                Owner has full access, Admin has limited access
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  'Create Admin'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
  );
};

export default AdminManagement;
