
import { Adapter, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

const FEE_RECIPIENT = '0x67262A61c0A459Fff172c22E60DBC730393BF790';

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getETHReceived({ options, target: FEE_RECIPIENT });
  return { dailyFees, }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-12-22',
    },
  },
  methodology: {
    Fees: "Fees paid by users while using services.",
  }
}

export default adapter;
