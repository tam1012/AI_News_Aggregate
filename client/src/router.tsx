import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Sources } from './pages/Sources';
import { Admin } from './pages/Admin';

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/voz" element={<Home />} />
          <Route path="/reddit" element={<Home />} />
          <Route path="/youtube" element={<Home />} />
          <Route path="/digest" element={<Home />} />
          <Route path="/article/:articleId" element={<Home />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
