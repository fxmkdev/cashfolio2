import {
  getSecuritiesExchanges,
  resolveSecuritySelection,
  getSecuritiesPreference,
  updateSecuritiesPreference,
  searchSecurities,
  getSecurityHistory,
  getSecurityMetadata,
} from "@/server/securities";
import {
  useSecuritiesController,
  type SecuritiesServices,
} from "@/components/security-search/controller";
import { SecuritySearchView } from "@/components/security-search/view";
import { Route } from "./route";
const services: SecuritiesServices = {
  resolve: (data, signal) => resolveSecuritySelection({ data, signal }),
  preference: (signal) => getSecuritiesPreference({ signal }),
  savePreference: (data, signal) =>
    updateSecuritiesPreference({ data, signal }),
  exchanges: (signal) => getSecuritiesExchanges({ signal }),
  search: (data, signal) => searchSecurities({ data, signal }),
  metadata: (data, signal) => getSecurityMetadata({ data, signal }),
  history: (data, signal) => getSecurityHistory({ data, signal }),
};
export function SecuritiesPage() {
  const view = Route.useSearch();
  const navigate = Route.useNavigate();
  const controller = useSecuritiesController(services, {
    view,
    navigate: (search) => {
      void navigate({ search });
    },
  });
  return <SecuritySearchView {...controller} />;
}
