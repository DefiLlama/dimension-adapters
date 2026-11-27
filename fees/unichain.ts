import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { blockscoutFeeAdapter2 } from "../helpers/blockscoutFees";

const SEQUENCER_FEE_VAULT = '0x4200000000000000000000000000000000000011';
const L1_FEE_VAULT = '0x420000000000000000000000000000000000001a';
const BASE_FEE_VAULT = '0x4200000000000000000000000000000000000019';
const FEE_VAULTS = [SEQUENCER_FEE_VAULT, L1_FEE_VAULT, BASE_FEE_VAULT];

const FEE_SPLITTER_LIVE_FROM = 1766966400;
const BASIS_POINT_SCALE = 1000n;
const GROSS_REVENUE_SHARE = 25n;
const NET_REVENUE_SHARE = 150n;
const NET_FEE_REVENUE = 'Net Fee Revenue';

async function getNetFeeRevenueWei(options: FetchOptions) {
  const { chain } = options;

  const accruedAt = async (block: number) => {
    const { output: vaultBalances } = await sdk.api2.eth.getBalances({ targets: FEE_VAULTS, chain, block });
    const processed = await sdk.api2.abi.multiCall({ abi: 'uint256:totalProcessed', calls: FEE_VAULTS, chain, block });
    return FEE_VAULTS.map((_, i) => BigInt(vaultBalances[i].balance) + BigInt(processed[i]));
  };

  const fromBlock = (await options.getFromBlock()) - 1;
  const toBlock = await options.getToBlock();
  const opening = await accruedAt(fromBlock);
  const closing = await accruedAt(toBlock);

  const [sequencer, l1, base] = FEE_VAULTS.map((vault, i) => {
    const accrued = closing[i] - opening[i];
    if (accrued < 0n) throw new Error(`unichain: fee vault ${vault} counters went down between blocks ${fromBlock} and ${toBlock}`);
    return accrued;
  });

  const netFeeRevenue = sequencer + base;
  const grossFeeRevenue = netFeeRevenue + l1;
  const optimismGrossShare = grossFeeRevenue * GROSS_REVENUE_SHARE / BASIS_POINT_SCALE;
  const optimismNetShare = netFeeRevenue * NET_REVENUE_SHARE / BASIS_POINT_SCALE;

  return optimismGrossShare > optimismNetShare
    ? netFeeRevenue * (BASIS_POINT_SCALE - GROSS_REVENUE_SHARE) / BASIS_POINT_SCALE
    : netFeeRevenue * (BASIS_POINT_SCALE - NET_REVENUE_SHARE) / BASIS_POINT_SCALE;
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.UNICHAIN]: {
      fetch: async (options: FetchOptions) => {
        const blockscoutAdapter = blockscoutFeeAdapter2(CHAIN.UNICHAIN)
        const fetchFunction = (blockscoutAdapter.adapter as any)[options.chain].fetch;
        const { dailyFees } = await fetchFunction(options)

        const dailyRevenue = options.createBalances()
        if (options.startOfDay >= FEE_SPLITTER_LIVE_FROM) {
          dailyRevenue.addGasToken((await getNetFeeRevenueWei(options)).toString(), NET_FEE_REVENUE)
        }

        return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue, dailyProtocolRevenue: 0 }
      }
    }
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Gas fees paid by users on Unichain, from the explorer totalfees endpoint.',
    Revenue: `The net fee share Unichain's FeeSplitter (0x4300c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d30001) forwards to the NetFeeSplitter, computed from what the sequencer, base and l1 fee vaults accrued over the day: optimism takes the larger of 2.5% of all three vaults and 15% of the sequencer and base vaults, and the net fee recipient takes the rest of the sequencer and base share.`,
    HoldersRevenue: 'Same as revenue, which the NetFeeSplitter pays out to its recipients.',
    ProtocolRevenue: 'None, Unichain keeps no part of the net fee share.',
  },
  breakdownMethodology: {
    Revenue: {
      [NET_FEE_REVENUE]: 'The share of the day\'s fee vault accrual that the FeeSplitter sends to the NetFeeSplitter.',
    },
    HoldersRevenue: {
      [NET_FEE_REVENUE]: 'The share of the day\'s fee vault accrual that the FeeSplitter sends to the NetFeeSplitter.',
    },
  },
}

export default adapter;
