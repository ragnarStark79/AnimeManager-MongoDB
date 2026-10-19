import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage }         from '../pages/LoginPage';
import { RegisterPage }      from '../pages/RegisterPage';
import { AdministratorPage } from '../pages/AdministratorPage';
import { SuperAdminPage }    from '../pages/SuperAdminPage';
import { Dashboard }       from '../pages/Dashboard';
import { BookmarksPage }   from '../pages/BookmarksPage';
import { MyListPage }      from '../pages/MyListPage';
import { CollectionsPage } from '../pages/CollectionsPage';
import { TitlesPage }      from '../pages/TitlesPage';
import { TitleDetailPage } from '../pages/TitleDetailPage';
import { ImportPage }      from '../pages/ImportPage';
import { SettingsPage }    from '../pages/SettingsPage';
import { NotFoundPage }    from '../pages/NotFoundPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="administrator" element={<AdministratorPage />} />
        <Route path="superadmin" element={<SuperAdminPage />} />
        <Route element={<AppShell />}>
          <Route index            element={<Dashboard />} />


          <Route path="bookmarks"   element={<BookmarksPage />} />
          <Route path="my-list"     element={<MyListPage />} />
          <Route path="collections" element={<CollectionsPage />} />
          <Route path="titles"      element={<TitlesPage />} />
          <Route path="titles/:id"  element={<TitleDetailPage />} />
          <Route path="import"      element={<ImportPage />} />
          <Route path="settings"    element={<SettingsPage />} />
          {/* Catch-all */}
          <Route path="*"           element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
