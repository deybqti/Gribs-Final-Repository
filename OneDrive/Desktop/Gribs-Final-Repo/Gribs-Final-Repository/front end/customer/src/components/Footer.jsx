import React from "react";
import "../App.css";

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h3>About Gold Rock Inn</h3>
          <p>
            Gold Rock Inn is a premier luxury hotel offering world-class accommodations 
            and exceptional service. Nestled in a picturesque location, we provide 
            guests with an unforgettable experience combining comfort, elegance, and 
            warm hospitality.
          </p>
        </div>
        
        <div className="footer-section">
          <h3>Contact Information</h3>
          <div className="contact-info">
            <p><strong>Phone:</strong> 09212766303/09052079637</p>
            <p><strong>Email:</strong> goldrockinn@yahoo.com</p>
            <p></p>
            <p></p>
            <h3>Landmark</h3>
            <p>Beside Grill Hub Restaurant</p>
            <p>Near Savemore Bambang</p>
          </div>
        </div>
        
        <div className="footer-section">
          <h3>Address</h3>
          <div className="address-info">
            <p>National Highway, Calaocan, Bambang, Nueva Vizcaya</p>
            <div style={{ marginTop: 12 }}>
              <iframe
                title="Gold Rock Inn Map"
                width="100%"
                height="200"
                style={{ border: 0, borderRadius: 8 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent('Gold Rock Inn, 136 1, Bambang, Nueva Vizcaya')}&output=embed`}
              />
            </div>
          </div>
        </div>
        
        <div className="footer-section">
          <h3>Hours</h3>
          <div className="hours-info">
            <p><strong>Check-in:</strong> 2:00 PM</p>
            <p><strong>Check-out:</strong> 12NN</p>
            <p><strong>Front Desk:</strong> 24/7</p>
          </div>
        </div>
      </div>
      
      <div className="footer-bottom">
        <p>&copy; 2024 Gold Rock Inn. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer; 