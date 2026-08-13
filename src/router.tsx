import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { Route as RootRoute } from "./routes/__root";
import { Route as IndexRoute } from "./routes/index";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Add the index route as a child of the root route
  RootRoute.addChildren([IndexRoute]);

  const router = createRouter({
    routeTree: RootRoute,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
