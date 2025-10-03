import React from 'react';
import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';

import Account from './components/Account/Account';
import Blocked from './components/Blocked/Blocked';
import Dashboard from './components/Dashboard/Dashboard';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import TestRunner from './components/TestRunner/TestRunner';
import Waiting from './components/Waiting/Waiting';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/test/:testId" element={<TestRunner />} />
      <Route path="/blocked" element={<Blocked />} />
      <Route path="/waiting" element={<Waiting />} />
      <Route path="/account" element={<Account />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
