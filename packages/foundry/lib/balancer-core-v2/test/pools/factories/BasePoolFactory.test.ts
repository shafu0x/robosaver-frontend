import { Contract } from 'ethers';

import * as expectEvent from '../../helpers/expectEvent';
import { deploy } from '../../../lib/helpers/deploy';
import { ZERO_ADDRESS } from '../../../lib/helpers/constants';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';

describe('BasePoolFactory', function () {
  let vault: Contract;
  let factory: Contract;
  let other: SignerWithAddress;

  before('setup signers', async () => {
    [, other] = await ethers.getSigners();
  });

  sharedBeforeEach(async () => {
    vault = await deploy('Vault', { args: [ZERO_ADDRESS, ZERO_ADDRESS, 0, 0] });
    factory = await deploy('MockPoolFactory', { args: [vault.address] });
  });

  it('stores the vault address', async () => {
    expect(await factory.getVault()).to.equal(vault.address);
  });

  it('creates a pool', async () => {
    const receipt = await (await factory.create()).wait();
    expectEvent.inReceipt(receipt, 'PoolCreated');
  });

  context('with a created pool', () => {
    let pool: string;

    sharedBeforeEach('deploy pool', async () => {
      const receipt = await (await factory.create()).wait();
      const event = expectEvent.inReceipt(receipt, 'PoolCreated');

      pool = event.args.pool;
    });

    it('tracks pools created by the factory', async () => {
      expect(await factory.isPoolFromFactory(pool)).to.be.true;
    });

    it('does not track pools that were not created by the factory', async () => {
      expect(await factory.isPoolFromFactory(other.address)).to.be.false;
    });
  });
});
