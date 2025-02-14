import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addGasTokensReceived, addTokensReceived, getETHReceived } from "../helpers/token";

const feeReceiverMultisig = "0x48735904455eda3aa9a0c9e43ee9999c795e30b9"
const fromAddresses = [
    "0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC",
    "0x5c952063c7fc8610FFDB798152D69F0B9550762b"
]
const revshareWallet = "0x2b6e6e4def77583229299cf386438a227e683b28" // not entirely sure but i suspect this is a rev share wallet

const fetch: any = async (options: FetchOptions) => {
  const dailyRevenue = await addTokensReceived({
    options, targets: [
      feeReceiverMultisig
    ], 
    fromAdddesses: fromAddresses
  })
  await addGasTokensReceived({multisig: feeReceiverMultisig, balances: dailyRevenue, options, fromAddresses})

  const dailyFees = dailyRevenue.clone()
  await getETHReceived({ options, balances: dailyFees, target: revshareWallet })
  await addTokensReceived({
    options, targets: [
        revshareWallet
    ], 
    fromAdddesses: fromAddresses,
    balances: dailyFees
  })

  return { dailyFees, dailyRevenue }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: { fetch },
  },
};
export default adapter;
