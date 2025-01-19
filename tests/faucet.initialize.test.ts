import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Faucet } from "../target/types/faucet";
import {
  FaucetMerkleLeaf,
  FaucetMerkleTree,
  FaucetUtils,
  TokenUtils,
} from "./utils";
import { expect } from "chai";

describe("faucet.initialize.test", () => {
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

  it("initialize authority manager", async () => {
    let authorityManager = await faucetUtils.initializeFaucetAuthorityManager(
      signer
    );

    expect(
      await faucetUtils.isAuthorityManagerInit(authorityManager),
      "Authority manager wasn't created!"
    ).to.be.true;

    expect(
      await faucetUtils.geAuthorityManagerAdmins(authorityManager),
      "Authority manager doesn't have admin!"
    ).to.deep.include(signer.publicKey);
  });

  it("initialize faucet claim", async () => {
    let tokenVault = await tokenUtils.initializeSplMint(signer, 100_000_000);
    await faucetUtils.initializeFaucetAuthorityManager(signer);

    let faucetClaimArgs = {
      totalFaucetAmount: new BN(10000),
      payerVault: tokenVault,
    };

    await faucetUtils.initializeFaucetClaim(signer, faucetClaimArgs);
  });

  it("initialize faucet claim shard", async () => {
    let leafs = [...Array(65535)].map(
      (_) => new FaucetMerkleLeaf(signer.publicKey, new BN(250))
    );

    let merkle_tree = new FaucetMerkleTree(leafs);

    let tokenVault = await tokenUtils.initializeSplMint(signer, 100_000_000);
    await faucetUtils.initializeFaucetAuthorityManager(signer);

    let faucetClaimArgs = {
      totalFaucetAmount: new BN(100_000),
      payerVault: tokenVault,
    };

    let faucetAccounts = await faucetUtils.initializeFaucetClaim(
      signer,
      faucetClaimArgs
    );

    let merkle_root = merkle_tree.tree.getRoot();

    let faucetClaimShardArgs = {
      faucetAccounts,
      merkle_root,
    };

    let faucetClaimShard = await faucetUtils.initializeFaucetClaimShard(
      signer,
      faucetClaimShardArgs
    );

    expect(
      await faucetUtils.isFaucetClaimShardInit(faucetClaimShard),
      "Faucet claim shard wasn't created!"
    ).to.be.true;

    expect(
      await faucetUtils.getFaucetClaimShardMerkleRoot(faucetClaimShard),
      "Faucet claim shard merkle root mismatch!"
    ).to.deep.equal(Array.from(merkle_root));
  });
});
