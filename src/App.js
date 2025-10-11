import { Analytics } from '@vercel/analytics/react';
import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';

import Account from './components/Account/Account';
import Blocked from './components/Blocked/Blocked';
import Dashboard from './components/Dashboard/Dashboard';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import TestRunner from './components/TestRunner/TestRunner';
import Waiting from './components/Waiting/Waiting';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/test/:testId" element={<TestRunner />} />
        <Route path="/account" element={<Account />} />
        <Route path="/waiting" element={<Waiting />} />
        <Route path="/blocked" element={<Blocked />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Analytics />
    </>
  );
}

export default App;
