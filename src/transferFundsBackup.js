// Use the old library to repair broken wallets
// Install dependencies
// yarn add crypto iota.lib.js

const crypto = require('crypto');
const IOTA = require('iota.lib.js');
const iotaCore = require('@iota/core');

const iota = new IOTA({provider: "https://nodes.devnet.iota.org"});

const myWalletSeed = 'SEED';

// Depth or how far to go for tip selection entry point
const depth = 3

// Difficulty of Proof-of-Work required to attach transaction to tangle.
// Minimum value on mainnet & spamnet is `14`, `9` on devnet and other testnets.
const minWeightMagnitude = 9

const seedGen = (length = 81) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ9';
  let seed = '';
  while (seed.length < length) {
          let byte = crypto.randomBytes(1)
          if (byte[0] < 243) {
              seed += charset.charAt(byte[0] % 27);
          }
      }
  return seed;
};


const purchaseData = async (address) => {
    try {
      const transfers = [{
        address,
        value: 1000,
      }];
      return new Promise((resolve, reject) => {
        iota.api.sendTransfer(myWalletSeed, depth, minWeightMagnitude, transfers, (error, result) => {
          if (error !== null) {
            console.error('sendTransfer error', error);
            reject(error);
          } else {
            console.log('Success');
            console.log(result);
            resolve(result);
          }
        });
      });
    } catch (error) {
      console.error('purchaseData error. Device address is invalid', error);
    }
}

const seed = seedGen();
const address = iotaCore.generateAddress(seed, 0);

console.log('seed', seed);
console.log('address', address);

// purchaseData(address)
