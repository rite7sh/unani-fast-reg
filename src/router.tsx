import { QueryClient } from "@tanstack/react-query";
import { createRouter, RootRoute, Route as TanStackRoute } from "@tanstack/react-router";
import { Route as RootRouteComponent } from "./routes/__root";
import { Route as IndexRouteComponent } from "./routes/index";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Create root route from the Root component
  const rootRoute = new RootRoute({
    component: RootRouteComponent.component,
    errorComponent: RootRouteComponent.errorComponent,
    notFoundComponent: RootRouteComponent.notFoundComponent,
    head: RootRouteComponent.head,
  });

  // Create index route from the Index component
  const indexRoute = new TanStackRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: IndexRouteComponent.component,
    head: IndexRouteComponent.head,
  });

  // Build the route tree
  const routeTree = rootRoute.addChildren([indexRoute]);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
