export const primaryRoutes = ["scanner", "positions", "research"] as const;
export const secondaryRoutes = ["strategy", "runtime", "settings"] as const;

export type PrimaryRoute = (typeof primaryRoutes)[number];
export type SecondaryRoute = (typeof secondaryRoutes)[number];
export type AppRoute = PrimaryRoute | SecondaryRoute;

export const routeLabels: Record<AppRoute, string> = {
  scanner: "Scanner",
  positions: "Positions",
  research: "Research",
  strategy: "Strategy & Evidence",
  runtime: "Runtime",
  settings: "Settings"
};
