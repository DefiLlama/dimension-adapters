import { FetchOptions } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

const totalFee = 12.5; // 10% performance + 2% management
const strategistFee = 0;  // no strategist fee
const managementFee = 2;
const revenueFee = totalFee - strategistFee;
const protocolShare = 100; // all goes to protocol
const oracleFee = 0.5; // 0.5% oracle fee


// const hurdleRate = 0;
// const oracleFee = 0;

// need to fetch based on the vault token
const hurdleRate = 0;

const methodology = {
  Fees: `${totalFee}% total fee (${managementFee}% management fee + ${oracleFee}% oracle fee + 10% performance fee) we only deduct if the hurdle rate is met each vault has its own hurdle rate, ETH uses lido and USDC uses USDY`,
  Revenue: "All fees are revenue and collected in vault tokens (maxETH, maxUSDC, maxUSDshare, maxETHshare)",
  ProtocolRevenue: "100% of revenue goes to protocol treasury",
};

const config: any = {
  ethereum: { 
    start: '2024-10-23',  
    tokens: ['0x9847c14FCa377305c8e2D10A760349c667c367d4'],  // maxETH vault token
    targets: ['0x5000Ba796Fd84a0f929AF80Cfe27301f0358F268']  // Treasury
  },
  polygon: {
    start: '2024-10-23',  
    tokens: [
      '0xA02aA8774E8C95F5105E33c2f73bdC87ea45BD29',  // maxETH vault token
      '0xE7FE898A1EC421f991B807288851241F91c7e376'   // maxUSDC vault token
    ],
    targets: ['0x91044419869d0921D682a50B41156503A4E484F6']  // Treasury
  },
  base: {
    start: '2025-04-22',
    tokens: [
      '0xb272e80042634Bca5d3466446b0C48Ba278A8Ae5', // metavault WETH token
      '0x7a63e8FC1d0A5E9BE52f05817E8C49D9e2d6efAe', // metavault USDC token
    ], 
    targets: ['0x5000Ba796Fd84a0f929AF80Cfe27301f0358F268']  // Treasury
  }
};

const adapter: any = {};

Object.keys(config).forEach(chain => {
  const { start, tokens, targets } = config[chain];
  adapter[chain] = {
    start,
    meta: { methodology },
    fetch: async (options: FetchOptions) => {
      const dailyRevenue = await addTokensReceived({ options, tokens, targets });
      const dailyFees = dailyRevenue.clone(totalFee / revenueFee);
      const dailyProtocolRevenue = dailyRevenue.clone(protocolShare / 100);
      
      return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
      }
    }
  }
});

export default {
  version: 2,
  adapter,
}
