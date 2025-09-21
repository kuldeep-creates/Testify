import React from 'react';
import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import Dashboard from './components/Dashboard/Dashboard';
import TestRunner from './components/TestRunner/TestRunner';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/test/:testId" element={<TestRunner />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
