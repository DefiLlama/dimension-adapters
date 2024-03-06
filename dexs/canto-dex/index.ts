import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const lpAddress = [
  '0x9571997a66d63958e1b3de9647c22bd6b9e7228c',
  '0x1d20635535307208919f0b67c3b2065965a85aa9',
  '0x30838619c55b787bafc3a4cd9aea851c1cfb7b19',
  '0x216400ba362d8fce640085755e47075109718c8b',
  '0x35db1f3a6a6f07f82c76fcc415db6cfb1a7df833',
  '0x830fbc440a0a61b429b9ece5b7a4af003537fad2',
];

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CANTO]: {
      fetch: getDexVolumeExports({ chain: CHAIN.CANTO, pools: lpAddress }),
      start: 1668988800,
    },
  }
};

export default adapter;
