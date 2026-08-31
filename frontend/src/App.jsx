import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import CVUploadPage from './pages/CVUploadPage.jsx';
import JobDetailPage from './pages/JobDetailPage.jsx';
import JobFeedPage from './pages/JobFeedPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import SavedJobsPage from './pages/SavedJobsPage.jsx';

/**
 * Five routes, no guards — there is nothing to guard. `/` is the landing page and
 * `/jobs` is the feed, whose search state lives in the query string so any view
 * of it is a shareable link.
 */
export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/jobs" element={<JobFeedPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/cv" element={<CVUploadPage />} />
        <Route path="/saved" element={<SavedJobsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
