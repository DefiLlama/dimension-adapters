const { ethers } = require('ethers');
const fs = require('fs');

const events = [
  'GasPaidForContractCall(address,string,string,bytes32,address,uint256,address)',
  'GasPaidForContractCallWithToken(address,string,string,bytes32,string,uint256,address,uint256,address)',
  'NativeGasPaidForContractCall(address,string,string,bytes32,uint256,address)',
  'GasPaidForExpressCall(address,string,string,bytes32,address,uint256,address)',
  'NativeGasPaidForExpressCall(address,string,string,bytes32,uint256,address)',
  'GasAdded(bytes32,uint256,address,uint256,address)',
  'NativeGasAdded(bytes32,uint256,uint256,address)',
  'ExpressGasAdded(bytes32,uint256,address,uint256,address)',
  'NativeExpressGasAdded(bytes32,uint256,uint256,address)'
];

let out = '';
events.forEach(e => {
  out += `${e.split('(')[0]}: ${ethers.id(e)}\n`;
});
fs.writeFileSync('axelar_topics.txt', out);
