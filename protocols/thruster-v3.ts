import { uniV3Exports } from "../helpers/uniswap";

export default uniV3Exports({ 
  blast: {
    factory: '0x71b08f13B3c3aF35aAdEb3949AFEb1ded1016127',
    customLogic: async ({ dailyVolume, dailyFees, fetchOptions }: any) => {
      // Add fees from fee distributor
      const logs = await fetchOptions.getLogs({
        target: "0xaafa3db42ea9c114c36a2a033e04c8bc0813c65c",
        eventAbi: "event CheckpointToken(uint256 time, uint256 tokens)",
      });
      logs.map((e: any) => {
        dailyFees.add('0x4300000000000000000000000000000000000003', e.tokens)
      });
      return { dailyVolume, dailyFees }
    }
  }
})
