import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const BURN_ACTOR = '0xff00000000000000000000000000000000000063'

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()])
    const [{ output: before }, { output: after }] = await Promise.all([
        sdk.api.eth.getBalance({ target: BURN_ACTOR, block: fromBlock, chain: CHAIN.FILECOIN }),
        sdk.api.eth.getBalance({ target: BURN_ACTOR, block: toBlock, chain: CHAIN.FILECOIN }),
    ])
    const fees = Number(BigInt(after) - BigInt(before)) / 1e18

  dailyFees.addCGToken('filecoin', fees)
  dailyRevenue.addCGToken('filecoin', fees)

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.FILECOIN],
  runAtCurrTime: true, // SpaceScope api is down and public filecoin rpcs prune old state, so past days cannot be refilled
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Transaction fees paid by users',
    HoldersRevenue: 'Transaction fees paid by users were burned',
  }
}

export default adapter;
