import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useSizeClass } from "./lib/ui";
import { UserProvider } from "./UserProvider";
import { Login } from "./screens/Login";
import { ForgotPassword } from "./screens/ForgotPassword";
import { ClaimAccount } from "./screens/ClaimAccount";
import { MainApp } from "./screens/MainApp";
import { UnlinkedSessionRedirect } from "./screens/UnlinkedSessionRedirect";

// App entry: providers and routes. In-app navigation (Home/Menu/Location/Settings) is tab
// state inside MainApp, not routes.

export default function RewardsApp() {
  const sizeClass = useSizeClass();
  useEffect(() => {
    document.documentElement.dataset.size = sizeClass;
  }, [sizeClass]);

  return (
    <UserProvider>
      <Router>
        <UnlinkedSessionRedirect />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/claim" element={<ClaimAccount />} />
          <Route path="/" element={<MainApp />} />
        </Routes>
      </Router>
    </UserProvider>
  );
}
