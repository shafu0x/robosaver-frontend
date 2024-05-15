import { assert } from 'console';
import { ethers } from 'hardhat';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { bn } from '../../helpers/numbers';
import { TokenList } from '../../helpers/tokens';
import { MAX_UINT256 } from '../../helpers/constants';
import { printGas, setupEnvironment, getWeightedPool, getStablePool, pickTokenAddresses } from './misc';
import { encodeJoinStablePool, encodeExitStablePool } from '../../helpers/stablePoolEncoding';
import { encodeJoinWeightedPool, encodeExitWeightedPool } from '../../helpers/weightedPoolEncoding';

// setup environment
const BPTAmount = bn(5e18);
const numberJoinsExits = 3;

let vault: Contract;
let tokens: TokenList;

let trader: SignerWithAddress;

const printTokens = (poolType: string, numTokens: number) => {
  if (numTokens % 2 == 0) {
    console.log(`${poolType} with ${numTokens} tokens`);
  }
};

async function main() {
  ({ vault, tokens, trader } = await setupEnvironment());

  console.log('== Full join/exit (no initial BPT) ==');

  console.log(`\n#Transferring tokens\n`);

  const joinWeightedUserData = encodeJoinWeightedPool({
    kind: 'TokenInForExactBPTOut',
    bptAmountOut: BPTAmount,
    enterTokenIndex: 0,
  });
  const exitWeightedUserData = encodeExitWeightedPool({ kind: 'ExactBPTInForTokensOut', bptAmountIn: BPTAmount });

  const joinStableUserData = encodeJoinStablePool({
    kind: 'TokenInForExactBPTOut',
    bptAmountOut: BPTAmount,
    enterTokenIndex: 0,
  });
  const exitStableUserData = encodeExitStablePool({ kind: 'ExactBPTInForTokensOut', bptAmountIn: BPTAmount });

  // numTokens is the size of the pool: 2,4,6,8
  for (let numTokens = 2; numTokens <= 8; numTokens += 2) {
    printTokens('Weighted pool', numTokens);
    await joinAndExitPool(
      () => getWeightedPool(vault, tokens, numTokens),
      numTokens,
      true,
      joinWeightedUserData,
      exitWeightedUserData
    );
  }
  console.log('\n');

  // numTokens is the size of the pool: 2,4
  // Stable have a max of 5
  for (let numTokens = 2; numTokens <= 4; numTokens += 2) {
    printTokens('Stable pool', numTokens);
    await joinAndExitPool(
      () => getStablePool(vault, tokens, numTokens),
      numTokens,
      true,
      joinStableUserData,
      exitStableUserData
    );
  }
  console.log('\n');

  console.log(`#With user balance\n`);

  // numTokens is the size of the pool: 2,4,6,8
  for (let numTokens = 2; numTokens <= 8; numTokens += 2) {
    printTokens('Weighted pool', numTokens);
    await joinAndExitPool(
      () => getWeightedPool(vault, tokens, numTokens),
      numTokens,
      false,
      joinWeightedUserData,
      exitWeightedUserData
    );
  }
  console.log('\n');

  // numTokens is the size of the pool: 2,4
  // Stable have a max of 5
  for (let numTokens = 2; numTokens <= 4; numTokens += 2) {
    printTokens('Stable pool', numTokens);
    await joinAndExitPool(
      () => getStablePool(vault, tokens, numTokens),
      numTokens,
      false,
      joinStableUserData,
      exitStableUserData
    );
  }
  console.log('\n');

  console.log('== Partial Join/Exit (2-stage entry/exit) ==');

  console.log(`\n#Transferring tokens\n`);

  for (let numTokens = 2; numTokens <= 8; numTokens += 2) {
    printTokens('Weighted pool', numTokens);
    await joinAndExitPool(
      () => getWeightedPool(vault, tokens, numTokens),
      numTokens,
      true,
      joinWeightedUserData,
      exitWeightedUserData,
      numberJoinsExits
    );
  }
  console.log('\n');

  for (let numTokens = 2; numTokens <= 4; numTokens += 2) {
    printTokens('Stable pool', numTokens);
    await joinAndExitPool(
      () => getStablePool(vault, tokens, numTokens),
      numTokens,
      true,
      joinStableUserData,
      exitStableUserData,
      numberJoinsExits
    );
  }
  console.log('\n');

  console.log(`#With user balance\n`);

  for (let numTokens = 2; numTokens <= 8; numTokens += 2) {
    printTokens('Weighted pool', numTokens);
    await joinAndExitPool(
      () => getWeightedPool(vault, tokens, numTokens),
      numTokens,
      false,
      joinWeightedUserData,
      exitWeightedUserData,
      numberJoinsExits
    );
  }
  console.log('\n');

  for (let numTokens = 2; numTokens <= 4; numTokens += 2) {
    printTokens('Stable pool', numTokens);
    await joinAndExitPool(
      () => getStablePool(vault, tokens, numTokens),
      numTokens,
      false,
      joinStableUserData,
      exitStableUserData,
      numberJoinsExits
    );
  }
}

async function joinAndExitPool(
  getPoolId: () => Promise<string>,
  numTokens: number,
  transferTokens: boolean,
  joinData: unknown,
  exitData: unknown,
  stageIdx = 1
) {
  const poolId: string = await getPoolId();
  const [poolAddress] = await vault.getPool(poolId);
  const pool: Contract = await ethers.getContractAt('WeightedPool', poolAddress);
  const joinRequest = {
    assets: pickTokenAddresses(tokens, numTokens),
    maxAmountsIn: Array(numTokens).fill(MAX_UINT256),
    userData: joinData,
    fromInternalBalance: !transferTokens,
  };
  const exitRequest = {
    assets: pickTokenAddresses(tokens, numTokens),
    minAmountsOut: Array(numTokens).fill(0),
    userData: exitData,
    fromInternalBalance: !transferTokens,
  };

  let receipt;
  let bpt;

  for (let idx = 1; idx <= stageIdx; idx++) {
    receipt = await (await vault.connect(trader).joinPool(poolId, trader.address, trader.address, joinRequest)).wait();
    console.log(`${printGas(receipt.gasUsed)} gas for join ${idx}`);

    bpt = await pool.balanceOf(trader.address);

    // check token balances
    assert(bpt.toString() == BPTAmount.mul(idx).toString(), 'Did not actually join pool');
  }

  // Now exit the pool
  for (let idx = 1; idx <= stageIdx; idx++) {
    receipt = await (await vault.connect(trader).exitPool(poolId, trader.address, trader.address, exitRequest)).wait();
    console.log(`${printGas(receipt.gasUsed)} gas for exit ${idx}`);

    bpt = await pool.balanceOf(trader.address);
    assert(bpt.toString() == BPTAmount.mul(stageIdx - idx).toString(), 'Did not actually exit pool');
  }

  bpt = await pool.balanceOf(trader.address);
  assert(bpt.toString() == '0', 'Did not actually exit pool');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
