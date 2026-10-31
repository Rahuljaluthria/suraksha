import { createBrowserRouter } from "react-router-dom"
import { AppLayout } from "@/components/layout/AppLayout"
import { Button } from "@/components/ui/button"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        // Temporary index route used to verify the foundation; replaced in Phase 2.
        index: true,
        element: (
          <div className="flex max-w-md flex-col gap-3">
            <h1 className="text-lg font-semibold">Foundation ready</h1>
            <p className="text-sm text-muted-foreground">
              Dark theme, teal accent, Geist, routing and shared layout are wired.
            </p>
            <div className="flex gap-2">
              <Button>Primary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
          </div>
        ),
      },
    ],
  },
])
