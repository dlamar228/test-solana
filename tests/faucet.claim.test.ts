import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";

import { Faucet } from "../target/types/faucet";
import {
  FaucetMerkleLeaf,
  FaucetMerkleTree,
  FaucetUtils,
  sleep,
  TokenUtils,
} from "./utils";
import { expect } from "chai";

describe("faucet.claim.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const signer = anchor.Wallet.local().payer;
  const faucetProgram = anchor.workspace.Faucet as Program<Faucet>;
  const confirmOptions = {
    skipPreflight: true,
  };
  const faucetUtils = new FaucetUtils(faucetProgram, confirmOptions);
  const tokenUtils = new TokenUtils(
    anchor.getProvider().connection,
    confirmOptions
  );

  it("initialize faucet claim shard", async () => {
    let tokenVault = await tokenUtils.initializeSplMint(
      signer,
      100_000_000_000
    );
    await faucetUtils.initializeFaucetAuthorityManager(signer);

    let addresses = [...Array(6)].map((_) => signer);
    let faucetAmount = new BN(50);

    let faucetClaimArgs = {
      epochClaimStarts: new BN(0),
      epochClaimEnds: new BN(100_000),
      totalFaucetAmount: new BN(addresses.length).mul(faucetAmount),
      payerVault: tokenVault,
    };

    let faucetAccounts = await faucetUtils.initializeFaucetClaim(
      signer,
      faucetClaimArgs
    );

    let shardAddress = faucetUtils.getShardAddress(
      faucetAccounts.faucetClaim,
      0
    );

    let leafs = addresses.map(
      (x) => new FaucetMerkleLeaf(shardAddress, x.publicKey, faucetAmount)
    );

    let merkle_tree = new FaucetMerkleTree(leafs);

    let merkle_root = merkle_tree.tree.getRoot();

    let faucetClaimShardArgs = {
      faucetAccounts,
      merkle_root,
    };

    let faucetClaimShard = await faucetUtils.initializeFaucetClaimShard(
      signer,
      faucetClaimShardArgs
    );

    for (let index = 0; index < merkle_tree.tree.getLeafCount(); index++) {
      let leafProof = merkle_tree.getIndexProof(index);

      let claimArgs = {
        faucetAccounts,
        faucetClaimShard,
        payerVault: tokenVault,
        index: leafProof.index,
        path: leafProof.proof,
        amount: faucetAmount,
      };

      await faucetUtils.claim(signer, claimArgs);
    }
  });
});
