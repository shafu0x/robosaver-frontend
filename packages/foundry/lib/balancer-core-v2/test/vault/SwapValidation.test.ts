import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, Contract, ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import * as expectEvent from '../helpers/expectEvent';
import { encodeJoin } from '../helpers/mockPool';
import TokenList from '../helpers/models/tokens/TokenList';
import TokensDeployer from '../helpers/models/tokens/TokensDeployer';

import { bn } from '../../lib/helpers/numbers';
import { deploy } from '../../lib/helpers/deploy';
import { fromNow, MONTH } from '../../lib/helpers/time';
import { GeneralPool } from '../../lib/helpers/pools';
import { FundManagement, Swap, SWAP_KIND } from '../../lib/helpers/trading';
import { MAX_INT256, MAX_UINT256, ZERO_ADDRESS } from '../../lib/helpers/constants';
import { actionId } from '../../lib/helpers/actions';

describe('Vault - swap validation', () => {
  let authorizer: Contract, vault: Contract;
  let tokens: TokenList;
  let admin: SignerWithAddress, lp: SignerWithAddress, trader: SignerWithAddress, other: SignerWithAddress;

  let poolIds: string[];

  before(async () => {
    [, admin, lp, trader, other] = await ethers.getSigners();
  });

  sharedBeforeEach('setup', async () => {
    const WETH = await TokensDeployer.deployToken({ symbol: 'WETH' });

    authorizer = await deploy('Authorizer', { args: [admin.address] });
    vault = await deploy('Vault', { args: [authorizer.address, WETH.address, MONTH, MONTH] });
    tokens = await TokenList.create(['DAI', 'MKR', 'SNX', 'BAT'], { sorted: true });

    const totalPools = 5;
    const initialBalance = bn(100e18);

    await tokens.mint([
      { to: lp, amount: initialBalance.mul(totalPools) },
      { to: trader, amount: initialBalance },
    ]);

    await tokens.approve({ to: vault, from: [lp, trader] });

    poolIds = [];
    for (let i = 0; i < totalPools; ++i) {
      // The Pool specialization setting does not affect validation
      const pool = await deploy('MockPool', { args: [vault.address, GeneralPool] });
      await pool.registerTokens(tokens.addresses, Array(tokens.length).fill(ZERO_ADDRESS));

      const poolId = await pool.getPoolId();

      await vault.connect(lp).joinPool(poolId, lp.address, ZERO_ADDRESS, {
        assets: tokens.addresses,
        maxAmountsIn: Array(tokens.length).fill(MAX_UINT256),
        fromInternalBalance: false,
        userData: encodeJoin(Array(tokens.length).fill(initialBalance), Array(tokens.length).fill(0)),
      });

      poolIds.push(poolId);
    }
  });

  let swaps: Swap[];
  beforeEach('create random swaps', () => {
    const randomInt = (max: number) => Math.floor(Math.random() * Math.floor(max));

    const assetInIndex = randomInt(tokens.length);
    const assetOutIndex = assetInIndex == 0 ? assetInIndex + 1 : assetInIndex - 1; // Must not equal token in index

    swaps = [];
    for (let i = 0; i < 10; ++i) {
      swaps.push({
        poolId: poolIds[randomInt(poolIds.length)],
        assetInIndex,
        assetOutIndex,
        amount: bn(randomInt(1e18)),
        userData: '0x',
      });
    }
  });

  context('in swaps given in', () => {
    const doSwap = (funds: FundManagement, limits: BigNumber[], deadline: BigNumber): Promise<ContractTransaction> => {
      return vault.connect(trader).batchSwap(SWAP_KIND.GIVEN_IN, swaps, tokens.addresses, funds, limits, deadline);
    };

    const querySwap = (funds: FundManagement): Promise<BigNumber[]> => {
      return vault.queryBatchSwap(SWAP_KIND.GIVEN_IN, swaps, tokens.addresses, funds);
    };

    itValidatesCorrectlyInAllCases(doSwap, querySwap);
  });

  context('in swaps given out', () => {
    const doSwap = (funds: FundManagement, limits: BigNumber[], deadline: BigNumber): Promise<ContractTransaction> => {
      return vault.connect(trader).batchSwap(SWAP_KIND.GIVEN_OUT, swaps, tokens.addresses, funds, limits, deadline);
    };

    const querySwap = (funds: FundManagement): Promise<BigNumber[]> => {
      return vault.queryBatchSwap(SWAP_KIND.GIVEN_OUT, swaps, tokens.addresses, funds);
    };

    itValidatesCorrectlyInAllCases(doSwap, querySwap);
  });

  function itValidatesCorrectlyInAllCases(
    doSwap: (funds: FundManagement, limits: BigNumber[], deadline: BigNumber) => Promise<ContractTransaction>,
    querySwap: (funds: FundManagement) => Promise<BigNumber[]>
  ) {
    let funds: FundManagement;
    beforeEach('setup funds', async () => {
      funds = {
        sender: trader.address,
        recipient: other.address,
        fromInternalBalance: false,
        toInternalBalance: false,
      };
    });

    context('with expired deadline', () => {
      it('reverts', async () => {
        const deadline = await fromNow(-5);

        await expect(doSwap(funds, Array(tokens.length).fill(MAX_INT256), deadline)).to.be.revertedWith(
          'SWAP_DEADLINE'
        );
      });
    });

    context('with unexpired deadline', () => {
      let deadline: BigNumber;

      sharedBeforeEach('set deadline', async () => {
        deadline = await fromNow(60);
      });

      context('when paused', () => {
        sharedBeforeEach('pause', async () => {
          const action = await actionId(vault, 'setPaused');
          await authorizer.connect(admin).grantRole(action, admin.address);
          await vault.connect(admin).setPaused(true);
        });

        it('reverts', async () => {
          await expect(doSwap(funds, Array(tokens.length).fill(MAX_INT256), await fromNow(60))).to.be.revertedWith(
            'PAUSED'
          );
        });
      });

      context('when unpaused', () => {
        it('reverts if there are less limits than tokens', async () => {
          await expect(doSwap(funds, Array(tokens.length - 1).fill(MAX_INT256), deadline)).to.be.revertedWith(
            'INPUT_LENGTH_MISMATCH'
          );
        });

        it('reverts if there are more limits than tokens', async () => {
          await expect(doSwap(funds, Array(tokens.length + 1).fill(MAX_INT256), deadline)).to.be.revertedWith(
            'INPUT_LENGTH_MISMATCH'
          );
        });

        context('with correct limit length', () => {
          let deltas: BigNumber[];

          beforeEach('query deltas', async () => {
            deltas = await querySwap(funds);
          });

          context('without withdrawing from internal balance', () => {
            beforeEach(() => {
              funds.fromInternalBalance = false;
            });

            itValidatesCorrectlyWithAndWithoutDepositing();
          });

          context('withdrawing from internal balance', () => {
            beforeEach(() => {
              funds.fromInternalBalance = true;
            });

            itValidatesCorrectlyWithAndWithoutDepositing();
          });

          function itValidatesCorrectlyWithAndWithoutDepositing() {
            context('without depositing to internal balance', () => {
              beforeEach(() => {
                funds.toInternalBalance = false;
              });

              itValidatesCorrectly();
            });

            context('depositing to internal balance', () => {
              beforeEach(() => {
                funds.toInternalBalance = true;
              });

              itValidatesCorrectly();
            });
          }

          function itValidatesCorrectly() {
            context('with limits too low', () => {
              it('reverts', async () => {
                await Promise.all(
                  deltas.map(async (_, i) => {
                    const limits = [...deltas];
                    limits[i] = deltas[i].sub(1);
                    await expect(doSwap(funds, limits, deadline)).to.be.revertedWith('SWAP_LIMIT');
                  })
                );
              });
            });

            context('with exact limits', () => {
              it('accepts the swap', async () => {
                const receipt = await (await doSwap(funds, deltas, deadline)).wait();
                expectEvent.inReceipt(receipt, 'Swap');
              });
            });

            context('with sufficient limits', () => {
              it('accepts the swap', async () => {
                await Promise.all(
                  deltas.map(async (_, i) => {
                    const limits = [...deltas];
                    limits[i] = deltas[i].add(1);

                    const receipt = await (await doSwap(funds, deltas, deadline)).wait();
                    expectEvent.inReceipt(receipt, 'Swap');
                  })
                );
              });
            });
          }
        });
      });
    });
  }
});
