import { SimpleAdapter } from "../adapters/types";
import { getFeesExport } from "../helpers/balancer";

const adapters: SimpleAdapter = {
  adapter: {
    defiverse: {fetch: getFeesExport('0x2FA699664752B34E90A414A42D62D7A8b2702B85'), },
    oas: {fetch: getFeesExport('0xfb6f8FEdE0Cb63674Ab964affB93D65a4a7D55eA'), },
  },
  version: 2,
};
export default adapters;
