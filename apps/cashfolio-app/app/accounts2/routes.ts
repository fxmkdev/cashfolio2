import { route } from "@react-router/dev/routes";

export const routes = [
  route("accounts2", "accounts2/list.route.tsx", [
    route(":type", "accounts2/grid.route.tsx"),
  ]),
];
