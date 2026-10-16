import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import AppShell from "./components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import DigitalTwin from "./pages/DigitalTwin";
import Energy from "./pages/Energy";
import Issues from "./pages/Issues";
import NotFound from "./pages/NotFound";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Waste from "./pages/Waste";
import Water from "./pages/Water";
import Vision from "./pages/Vision";

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="h-full"
      >
        <Routes location={location}>
          <Route index element={<Dashboard />} />
          <Route path="twin" element={<DigitalTwin />} />
          <Route path="vision" element={<Vision />} />
          <Route path="issues" element={<Issues />} />
          <Route path="energy" element={<Energy />} />
          <Route path="water" element={<Water />} />
          <Route path="waste" element={<Waste />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <AppShell>
      <AnimatedRoutes />
    </AppShell>
  );
}
