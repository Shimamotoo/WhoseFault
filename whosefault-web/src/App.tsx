import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { OccurrencesProvider } from "@/context/OccurrencesContext";
import { AppShell } from "@/components/layout/AppShell";
import { OccurrencesListPage } from "@/pages/OccurrencesListPage";
import { OccurrenceDetailsPage } from "@/pages/OccurrenceDetailsPage";

export function App() {
  return (
    <OccurrencesProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/occurrences" replace />} />
            <Route path="occurrences" element={<OccurrencesListPage />} />
            <Route path="occurrences/:id" element={<OccurrenceDetailsPage />} />
            <Route path="*" element={<Navigate to="/occurrences" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </OccurrencesProvider>
  );
}

export default App;
