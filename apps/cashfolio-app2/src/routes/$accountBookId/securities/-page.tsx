import {
  getSecuritiesExchanges,
  searchSecurities,
  getSecurityHistory,
  getSecurityMetadata,
} from "@/server/securities";
import {
  useSecuritiesController,
  type SecuritiesServices,
} from "@/components/security-search/controller";
import { SecuritySearchView } from "@/components/security-search/view";
const services: SecuritiesServices = {
  exchanges: (signal) => getSecuritiesExchanges({ signal }),
  search: (data, signal) => searchSecurities({ data, signal }),
  metadata: (data, signal) => getSecurityMetadata({ data, signal }),
  history: (data, signal) => getSecurityHistory({ data, signal }),
};
export function SecuritiesPage() {
  return <SecuritySearchView {...useSecuritiesController(services)} />;
}
