import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../userContext";

// A signed-in login that no customer record matches (see unlinkedAuthEmail) gets the
// /no-account screen from any other route, including the /login page a Google sign-in returns to.
export function UnlinkedSessionRedirect() {
  const { unlinkedAuthEmail } = useUser();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (unlinkedAuthEmail && location.pathname !== "/no-account") {
      navigate("/no-account", { replace: true });
    }
  }, [unlinkedAuthEmail, location.pathname, navigate]);

  return null;
}
