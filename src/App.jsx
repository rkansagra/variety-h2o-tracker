import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useSizeClass } from "./lib/ui";
import { UserProvider } from "./UserProvider";
import { MenuProvider } from "./MenuProvider";
import { Login } from "./screens/Login";
import { ForgotPassword } from "./screens/ForgotPassword";
import { NoAccount } from "./screens/NoAccount";
import { MainApp } from "./screens/MainApp";
import { UnlinkedSessionRedirect } from "./screens/UnlinkedSessionRedirect";

// App entry: providers and routes. MainApp owns everything under `/` (Home, `/menu`, `/location`,
// `/settings`, `/admin`); the sign-in screens are their own routes here.

export default function RewardsApp() {
  const sizeClass = useSizeClass();
  useEffect(() => {
    document.documentElement.dataset.size = sizeClass;
  }, [sizeClass]);

  return (
    <UserProvider>
      <MenuProvider>
      <Router>
        <UnlinkedSessionRedirect />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/no-account" element={<NoAccount />} />
          <Route path="/*" element={<MainApp />} />
        </Routes>
      </Router>
      </MenuProvider>
    </UserProvider>
  );
}
