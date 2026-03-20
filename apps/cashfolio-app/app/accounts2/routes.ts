import { index, route } from "@react-router/dev/routes";

export const routes = [
  route("accounts2", "accounts2/list.route.tsx", [
    index("accounts2/list-redirect.route.tsx"),
    route(":type", "accounts2/grid.route.tsx"),
  ]),
];
