import React from 'react';
import { NavLink } from 'react-router-dom';

function Sidebar({ items = [] }) {
  return (
    <aside className="sidebar sidebar-sticky">
      <div className="sidebar-logo">
        <img src="/logo.png" alt="Gold Rock Inn" className="sidebar-logo-img" />
        <div className="sidebar-logo-title">GOLD ROCK INN</div>
        <div className="sidebar-logo-sub">MANAGEMENT</div>
      </div>
      <nav className="sidebar-nav">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-link${isActive ? ' sidebar-link-active' : ''}`
            }
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;