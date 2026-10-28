import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { OccurrencesProvider } from "@/context/OccurrencesContext";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { OccurrencesListPage } from "@/pages/OccurrencesListPage";
import { OccurrenceDetailsPage } from "@/pages/OccurrenceDetailsPage";

export function App() {
  return (
    <AuthProvider>
      <OccurrencesProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="/login" replace />} />
              <Route path="occurrences" element={<OccurrencesListPage />} />
              <Route path="occurrences/:id" element={<OccurrenceDetailsPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </OccurrencesProvider>
    </AuthProvider>
  );
}

export default App;
