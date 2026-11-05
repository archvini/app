import { Navigate, Route, Routes } from "react-router-dom";

import Navbar from "@/components/layout/Navbar";
import Onboarding from "@/components/onboarding/Onboarding";
import { Toaster } from "@/components/ui/sonner";
import AlertsInboxPage from "@/pages/AlertsInboxPage";
import ChatPage from "@/pages/ChatPage";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import MapPage from "@/pages/MapPage";
import MissionsPage from "@/pages/MissionsPage";
import ProfilePage from "@/pages/ProfilePage";
import Register from "@/pages/Register";
import PeoplePage from "@/pages/PeoplePage";
import PersonPage from "@/pages/PersonPage";
import SettingsPage from "@/pages/SettingsPage";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import LegalPage from "@/pages/LegalPage";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Navbar />
      <main className="pb-14 pt-14 md:pb-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/alertas" element={<AlertsInboxPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/configuracoes" element={<SettingsPage />} />
          <Route path="/configuracoes/:secao" element={<SettingsPage />} />
          <Route path="/ciclistas" element={<PeoplePage />} />
          <Route path="/ciclistas/:id" element={<PersonPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/esqueci-senha" element={<ForgotPassword />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route path="/privacidade" element={<LegalPage kind="privacidade" />} />
          <Route path="/termos" element={<LegalPage kind="termos" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Onboarding />
      <Toaster />
    </div>
  );
}