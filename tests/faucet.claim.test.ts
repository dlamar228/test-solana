import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
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

  it("Should initialize faucet claim shard", async () => {
    let tokenVault = await tokenUtils.initializeSplMint(
      signer,
      100_000_000_000
    );

    await faucetUtils.initializeAuthorityManager(signer);

    let faucetVault = await faucetUtils.initializeFaucetVault(
      signer,
      tokenVault.mint
    );

    await tokenUtils.mintTo(
      signer,
      signer,
      tokenVault.mint.address,
      faucetVault,
      100_000
    );

    let faucetAccounts = await faucetUtils.initializeFaucetClaim(
      signer,
      tokenVault.mint
    );

    let shardAddress = faucetUtils.getShardAddress(
      faucetAccounts.faucetClaim,
      0
    );

    let leafs = [...Array(65535)].map(
      (_) => new FaucetMerkleLeaf(shardAddress, signer.publicKey, new BN(250))
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

    expect(
      await faucetUtils.isFaucetClaimShardInit(faucetClaimShard),
      "Faucet claim shard wasn't created!"
    ).to.be.true;

    expect(
      await faucetUtils.getFaucetClaimShardMerkleRoot(faucetClaimShard),
      "Faucet claim shard merkle root mismatch!"
    ).to.deep.equal(Array.from(merkle_root));
  });

  it("Should claim tokens", async () => {
    let tokenVault = await tokenUtils.initializeSplMint(
      signer,
      100_000_000_000
    );

    await faucetUtils.initializeAuthorityManager(signer);

    let faucetVault = await faucetUtils.initializeFaucetVault(
      signer,
      tokenVault.mint
    );

    await tokenUtils.mintTo(
      signer,
      signer,
      tokenVault.mint.address,
      faucetVault,
      100_000
    );

    let addresses = [...Array(6)].map((_) => signer);
    let faucetAmount = new BN(50);

    let faucetAccounts = await faucetUtils.initializeFaucetClaim(
      signer,
      tokenVault.mint
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
