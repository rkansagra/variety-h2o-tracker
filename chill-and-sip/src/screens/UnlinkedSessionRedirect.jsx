import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../userContext";

// A signed-in login with no linked profile (see unlinkedAuthEmail) can only do one useful
// thing -- redeem a claim code -- so send it to /claim from any other route, including the
// /login page a Google sign-in returns to.
export function UnlinkedSessionRedirect() {
  const { unlinkedAuthEmail } = useUser();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (unlinkedAuthEmail && location.pathname !== "/claim") {
      navigate("/claim", { replace: true });
    }
  }, [unlinkedAuthEmail, location.pathname, navigate]);

  return null;
}
