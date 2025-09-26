import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { FirebaseProvider } from './context/FirebaseContext';

test('renders app without crashing', () => {
  render(
    <BrowserRouter>
      <FirebaseProvider>
        <App />
      </FirebaseProvider>
    </BrowserRouter>
  );
});
