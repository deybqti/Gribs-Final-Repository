import React from "react";
import { NavLink } from "react-router-dom";
import "../App.css";

const Navigation = () => (
  <nav className="nav">
    <NavLink to="/" end className={({ isActive }) => isActive ? "active" : ""}>HOME</NavLink>
    <NavLink to="/about" className={({ isActive }) => isActive ? "active" : ""}>ABOUT US</NavLink>
    <NavLink to="/offers" className={({ isActive }) => isActive ? "active" : ""}>OFFERS</NavLink>
    <NavLink to="/contact" className={({ isActive }) => isActive ? "active" : ""}>CONTACT</NavLink>
  </nav>
);

export default Navigation; 