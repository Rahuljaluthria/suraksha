import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "@/app/store";
import { useAppDispatch } from "@/app/hooks";
import { restoreSession } from "@/features/auth/authSlice";
import { router } from "@/routes/router";

function AppContent() {
  const dispatch = useAppDispatch();

  // Restore active session on initial app mount via HttpOnly cookie exchange
  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

export default App;
