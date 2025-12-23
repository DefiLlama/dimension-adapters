import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addTokensReceived } from '../helpers/token';

const config: { [chain: string]: { fundStore: string } } = {
  [CHAIN.ARBITRUM]: {
    fundStore: '0xe00975A0D7def3FAE93832cc72D5ff50432fc857',
  },
  [CHAIN.BASE]: {
    fundStore: '0x8508ea3bf4a8ec12cf6a6799421b725300f9a6dd',
  },
};

const fetch = async (options: FetchOptions) => {
  const chainConfig = config[options.chain];

  if (!chainConfig) {
    throw new Error(`No chain config found for chain: ${options.chain}`);
  }

  const dailyFees = await addTokensReceived({
    options,
    targets: [chainConfig.fundStore],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: 'Tracks tokens explicitly received by Cap V4 protocol-controlled FundStore contracts.',
  Revenue: 'All tokens received by the FundStore are treated as protocol revenue.',
  ProtocolRevenue: 'Same as Revenue.',
  Limitations:
    'Conservative approach based on explicit token transfers. Vault deposits and internal accounting are intentionally excluded to avoid double counting.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-02-19',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2023-07-31',
    },
  },
  methodology,
};

export default adapter;
