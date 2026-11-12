import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAppData } from './hooks/useAppData'
import { useAppearance } from './hooks/useAppearance'
import { ChapterPage } from './pages/ChapterPage'
import { ChaptersPage } from './pages/ChaptersPage'
import { ConceptPage, ConceptsPage } from './pages/ConceptsPage'
import { MemorizeIndexPage } from './pages/MemorizeIndexPage'
import { MemorizePage } from './pages/MemorizePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PracticePage } from './pages/PracticePage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'

export function App() {
  const data = useAppData()
  useAppearance(data.settings)

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="chapters" element={<ChaptersPage />} />
        <Route path="chapters/:number" element={<ChapterPage />} />
        <Route path="memorize" element={<MemorizeIndexPage />} />
        <Route path="memorize/:number" element={<MemorizePage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="practice" element={<PracticePage />} />
        <Route path="concepts" element={<ConceptsPage />} />
        <Route path="concepts/:slug" element={<ConceptPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="chapter" element={<Navigate to="/chapters" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
