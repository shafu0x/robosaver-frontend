import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

export type NAry<T> = T | Array<T>;

export type Account = string | SignerWithAddress | Contract;

export type TxParams = {
  from?: SignerWithAddress;
};
