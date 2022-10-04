import balancer from "./balancer";
import mooniswap from "./mooniswap";
import bancor from "./bancor";
import carthage from "./carthage";
import champagneswap from "./champagneswap";
import curve from "./curve";
import dodo from "./dodo";
import katana from "./katana";
import klayswap from "./klayswap";
import osmosis from "./osmosis";
import pancakeswap from "./pancakeswap";
import quickswap from "./quickswap";
import raydium from "./raydium";
import saros from "./saros";
import serum from "./serum";
import soulswap from "./soulswap";
import spiritswap from "./spiritswap";
import spookyswap from "./spookyswap";
import sushiswap from "./sushiswap";
import terraswap from "./terraswap";
import traderjoe from "./traderjoe";
import uniswap from "./uniswap";
import yieldfields from "./yieldfields";
import gmx from "./gmx";
import velodrome from "./velodrome";
import woofi from "./woofi";
import hashflow from "./hashflow";
import biswap from "./biswap";
import zipswap from "./zipswap";
import wardenswap from "./wardenswap";
import apeswap from "./apeswap";
import kyberswap from "./kyberswap";
import orca from "./orca";
import pangolin from "./pangolin";
import refFinance from "./ref-finance";
import saber from "./saber";
import solidly from "./solidly";
import yoshiExchange from "./yoshi-exchange";
import platypus from "./platypus";
import wombatExchange from "./wombat-exchange";
import wingriders from "./wingriders";
import minswap from "./minswap";
import mojitoswap from "./mojitoswap";
import mdex from "./mdex";
import meshswap from "./meshswap";
import vvsFinance from "./vvs-finance";
import mmStableswapPolygon from "./mm-stableswap-polygon";
import dfyn from "./dfyn";
import radioshack from "./radioshack";
import flamingoFinance from "./flamingo-finance";
import ZEROx from "./0x";
// import bakerySwap from "./bakeryswap"; //broken
import baryon from "./baryon";
import cherryswap from "./cherryswap";
import clipper from "./clipper";
import cryptoswap from "./cryptoswap";
import ellipsis from "./ellipsis";
import klexFinance from "./klex-finance";
import koyo from "./koyo";
// import lyra from "./lyra"; // Options dex
import pyeswap from "./pyeswap";
import smbswap from "./smbswap";
import sunswap from "./sunswap";
import whaleswap from "./whaleswap";
import nomiswap from "./nomiswap";
import fstswap from "./fstswap";
import beethovenX from "./beethoven-x";
import defiSwap from "./defi-swap";
import wanswapDex from "./wanswap-dex";
import solarbeam from "./solarbeam";
import tombFinance from "./tomb-swap";
import dfxFinance from "./dfx-finance";
import fraxswap from "./frax-swap";
import iziswap from "./iziswap";
import tinyman from "./tinyman";
import junoswap from "./junoswap";
import knightswapFinance from "./knightswap-finance";
import shibaswap from "./shibaswap";
import oolongswap from "./oolongswap";
import viperswap from "./viperswap";
import swapr from "./swapr";
import cone from "./cone";
import claimswap from "./claimswap";
import spartacusExchange from "./spartacus-exchange";
import beamswap from "./beamswap";
import openleverage from "./openleverage";
import ubeswap from "./ubeswap";
import mobiusMoney from "./mobius-money";
import honeyswap from "./honeyswap";
import energiswap from "./energiswap";
import stellaswap from "./stellaswap";
import wagyuswap from "./wagyuswap";
import dystopia from "./dystopia";
import glideFinance from "./glide-finance";
import quipuswap from "./quipuswap";
import netswap from "./netswap";
import jupiterAggregator from "./jupiter-aggregator";
import astroport from "./astroport";
import mimo from "./mimo";
import tethysFinance from "./tethys-finance";
import kaidex from "./kaidex";
import lif3Swap from "./lif3-swap";
import swappi from "./swappi";
import yodeswap from "./yodeswap";
import polycat from "./polycat";
import defikingdoms from "./defikingdoms";
import defiplaza from "./defiplaza";
import voltswap from "./voltswap";

export default {
  mooniswap,
  balancer,
  bancor,
  carthage,
  champagneswap,
  curve,
  dodo,
  katana,
  klayswap,
  osmosis,
  pancakeswap,
  quickswap,
  raydium,
  saros,
  serum,
  soulswap,
  spiritswap,
  spookyswap,
  sushiswap,
  terraswap,
  traderjoe,
  uniswap,
  yieldfields,
  gmx,
  velodrome,
  woofi,
  hashflow,
  biswap,
  zipswap,
  wardenswap,
  apeswap,
  kyberswap,
  orca,
  pangolin,
  "ref-finance": refFinance,
  saber,
  solidly,
  "yoshi-exchange": yoshiExchange,
  platypus,
  "wombat-exchange": wombatExchange,
  wingriders,
  minswap,
  mojitoswap,
  mdex,
  meshswap,
  "vvs-finance": vvsFinance,
  "mm-stableswap-polygon": mmStableswapPolygon,
  dfyn,
  radioshack,
  "flamingo-finance": flamingoFinance,
  "0x": ZEROx,
  baryon,
  cherryswap,
  clipper,
  cryptoswap,
  ellipsis,
  "klex-finance": klexFinance,
  koyo,
  pyeswap,
  smbswap,
  sunswap,
  whaleswap,
  nomiswap,
  // fstswap, -> incorrect subgraph
  "beethoven-x": beethovenX,
  "defi-swap": defiSwap,
  "wanswap-dex": wanswapDex,
  solarbeam,
  "tomb-swap": tombFinance,
  "dfx-finance": dfxFinance,
  "frax-swap": fraxswap,
  iziswap,
  tinyman,
  junoswap,
  "knightswap-finance": knightswapFinance,
  shibaswap,
  oolongswap,
  viperswap,
  swapr,
  cone,
  claimswap,
  "spartacus-exchange" : spartacusExchange,
  beamswap,
  openleverage,
  ubeswap,
  "mobius-money": mobiusMoney,
  honeyswap,
  energiswap,
  stellaswap,
  wagyuswap,
  dystopia,
  "glide-finance": glideFinance,
  quipuswap,
  netswap,
  "jupiter-aggregator":jupiterAggregator,
  astroport,
  mimo,
  "tethys-finance": tethysFinance,
  kaidex,
  "lif3-swap": lif3Swap,
  swappi,
  yodeswap,
  polycat,
  defikingdoms,
  defiplaza,
  voltswap
  // lyra -> OPTIONS DEX, not enable for now
};
