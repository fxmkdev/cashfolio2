import {
  getSecuritiesCatalogue,
  searchSecurities,
  getSecuritiesFilterOptions,
  getSecurityHistory,
} from "@/server/securities";
import {
  useSecuritiesController,
  type SecuritiesServices,
} from "@/components/security-search/controller";
import { SecuritySearchView } from "@/components/security-search/view";
const services: SecuritiesServices = {
  catalogue: (signal) => getSecuritiesCatalogue({ signal }),
  search: (data, signal) => searchSecurities({ data, signal }),
  filters: (data, signal) => getSecuritiesFilterOptions({ data, signal }),
  history: (data, signal) => getSecurityHistory({ data, signal }),
};
export function SecuritiesPage() {
  return <SecuritySearchView {...useSecuritiesController(services)} />;
}
