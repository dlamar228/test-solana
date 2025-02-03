import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Faucet } from "../../target/types/faucet";
import {
  PublicKey,
  Signer,
  ConfirmOptions,
  TransactionSignature,
} from "@solana/web3.js";
import { Mint, TokenVault } from "./token.utils";
import { u16ToBytes } from "./utils";

import MerkleTree from "merkletreejs";
import { keccak_256 } from "@noble/hashes/sha3";

export interface FaucetClaimAccounts {
  authority: PublicKey;
  authorityManager: PublicKey;
  faucetClaim: PublicKey;
  faucetVault: TokenVault;
  shards: Array<PublicKey>;
}

export interface InitializeFaucetClaimShardArgs {
  faucetAccounts: FaucetClaimAccounts;
  merkle_root: Buffer<ArrayBufferLike>;
}

export interface ClaimArgs {
  faucetAccounts: FaucetClaimAccounts;
  faucetClaimShard: PublicKey;
  payerVault: TokenVault;
  index: number;
  path: Array<Buffer<ArrayBufferLike>>;
  amount: BN;
}

export interface WithdrawExpiredFaucetClaimArgs {
  faucetAccounts: FaucetClaimAccounts;
  payerVault: TokenVault;
}

export interface FaucetClaimDestroyArgs {
  faucetAccounts: FaucetClaimAccounts;
}

export interface FaucetClaimShardDestroyArgs {
  faucetAccounts: FaucetClaimAccounts;
  faucetClaimShard: PublicKey;
}

export class FaucetUtils {
  program: Program<Faucet>;
  pdaGetter: FaucetPda;
  confirmOptions: ConfirmOptions;

  constructor(program: Program<Faucet>, confirmOptions: ConfirmOptions) {
    this.program = program;
    this.confirmOptions = confirmOptions;
    this.pdaGetter = new FaucetPda(program.programId);
  }
  async initializeAuthorityManager(signer: Signer) {
    let [authority] = this.pdaGetter.getAuthorityAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();

    if (await this.isAuthorityManagerInit(authorityManager)) {
      return authorityManager;
    }

    await this.program.methods
      .initializeAuthorityManager()
      .accounts({
        payer: signer.publicKey,
        authorityManager,
        authority,
      })
      .rpc();

    return authorityManager;
  }
  async AddAdmin(signer: Signer, index: BN, admin: PublicKey) {
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();

    await this.program.methods
      .setAdmin(index, admin)
      .accounts({
        payer: signer.publicKey,
        authorityManager,
      })
      .rpc();

    return authorityManager;
  }
  async removeAdmin(signer: Signer, index: BN) {
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();

    await this.program.methods
      .removeAdmin(index)
      .accounts({
        payer: signer.publicKey,
        authorityManager,
      })
      .rpc();

    return authorityManager;
  }
  async initializeFaucetVault(signer: Signer, mint: Mint) {
    let [authority] = this.pdaGetter.getAuthorityAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    let [faucetVault] = this.pdaGetter.getFaucetVaultAddress(mint.address);

    await this.program.methods
      .initializeFaucetVault()
      .accounts({
        payer: signer.publicKey,
        authorityManager,
        authority,
        mint: mint.address,
        faucetVault,
        tokenProgram: mint.program,
      })
      .rpc();

    return faucetVault;
  }
  async initializeFaucetClaim(
    signer: Signer,
    mint: Mint
  ): Promise<FaucetClaimAccounts> {
    let [authority] = this.pdaGetter.getAuthorityAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    let [faucetClaim] = this.pdaGetter.getFaucetClaimAddress(mint.address);
    let [faucetVault] = this.pdaGetter.getFaucetVaultAddress(mint.address);

    await this.program.methods
      .initializeFaucetClaim()
      .accounts({
        admin: signer.publicKey,
        authorityManager,
        authority,
        faucetClaim,
        mint: mint.address,
        faucetVault,
        tokenProgram: mint.program,
      })
      .rpc();

    return {
      authority,
      authorityManager,
      faucetClaim,
      faucetVault: {
        address: faucetVault,
        mint: mint,
      },
      shards: [],
    };
  }
  getShardAddress(faucetClaim: PublicKey, index: number) {
    let [shardAddress] = this.pdaGetter.getFaucetClaimShardAddress(
      faucetClaim,
      index
    );

    return shardAddress;
  }
  async initializeFaucetClaimShard(
    signer: Signer,
    args: InitializeFaucetClaimShardArgs
  ): Promise<PublicKey> {
    let shardIndex = await this.getShardIndex(args.faucetAccounts.faucetClaim);
    let [shardAddress] = this.pdaGetter.getFaucetClaimShardAddress(
      args.faucetAccounts.faucetClaim,
      shardIndex
    );

    let merkleRootArray: number[] = Array.from(args.merkle_root);
    let tx = await this.program.methods
      .initializeFaucetClaimShard(merkleRootArray)
      .accounts({
        admin: signer.publicKey,
        authorityManager: args.faucetAccounts.authorityManager,
        faucetClaim: args.faucetAccounts.faucetClaim,
        faucetClaimShard: shardAddress,
        mint: args.faucetAccounts.faucetVault.mint.address,
        tokenProgram: args.faucetAccounts.faucetVault.mint.program,
      })
      .rpc();

    args.faucetAccounts.shards.push(shardAddress);

    return shardAddress;
  }
  async claim(signer: Signer, args: ClaimArgs): Promise<TransactionSignature> {
    let path: Array<number[]> = args.path.map((x) => Array.from(x));
    let tx = await this.program.methods
      .claim(path, args.index, args.amount)
      .accounts({
        payer: signer.publicKey,
        authority: args.faucetAccounts.authority,
        authorityManager: args.faucetAccounts.authorityManager,
        faucetClaim: args.faucetAccounts.faucetClaim,
        faucetClaimShard: args.faucetClaimShard,
        faucetVault: args.faucetAccounts.faucetVault.address,
        mint: args.payerVault.mint.address,
        payerVault: args.payerVault.address,
      })
      .rpc();

    return tx;
  }
  async withdrawExpiredFaucetClaim(
    signer: Signer,
    args: WithdrawExpiredFaucetClaimArgs
  ): Promise<TransactionSignature> {
    let tx = await this.program.methods
      .withdrawExpiredFaucetClaim()
      .accounts({
        payer: signer.publicKey,
        authority: args.faucetAccounts.authority,
        authorityManager: args.faucetAccounts.authorityManager,
        faucetClaim: args.faucetAccounts.faucetClaim,
        faucetVault: args.faucetAccounts.faucetVault.address,
        mint: args.payerVault.mint.address,
        payerVault: args.payerVault.address,
      })
      .rpc();

    return tx;
  }
  async faucetClaimDestroy(
    signer: Signer,
    args: FaucetClaimDestroyArgs
  ): Promise<TransactionSignature> {
    let tx = await this.program.methods
      .destroyFaucetClaim()
      .accounts({
        payer: signer.publicKey,
        authorityManager: args.faucetAccounts.authorityManager,
        faucetClaim: args.faucetAccounts.faucetClaim,
      })
      .rpc();

    return tx;
  }
  async faucetClaimShardDestroy(
    signer: Signer,
    args: FaucetClaimShardDestroyArgs
  ): Promise<TransactionSignature> {
    let tx = await this.program.methods
      .destroyFaucetClaimShard()
      .accounts({
        payer: signer.publicKey,
        authorityManager: args.faucetAccounts.authorityManager,
        faucetClaimShard: args.faucetClaimShard,
        faucetClaim: args.faucetAccounts.faucetClaim,
      })
      .rpc();

    return tx;
  }
  async isAuthorityManagerInit(authorityManager: PublicKey): Promise<boolean> {
    let state = await this.program.account.authorityManager.fetchNullable(
      authorityManager
    );

    return state !== null;
  }
  async geAuthorityManager(authorityManager: PublicKey) {
    let state = await this.program.account.authorityManager.fetchNullable(
      authorityManager
    );

    return state;
  }
  async getShardIndex(faucetClaim: PublicKey): Promise<number> {
    let state = await this.program.account.faucetClaim.fetchNullable(
      faucetClaim
    );
    return state.shards;
  }
  async isFaucetClaimShardInit(faucetClaimShard: PublicKey): Promise<boolean> {
    let state = await this.program.account.faucetClaimShard.fetchNullable(
      faucetClaimShard
    );
    return state !== null;
  }
  async getFaucetClaimShardMerkleRoot(
    faucetClaimShard: PublicKey
  ): Promise<number[]> {
    let state = await this.program.account.faucetClaimShard.fetchNullable(
      faucetClaimShard
    );
    return state.merkleRoot;
  }

  async getFaucetClaimState(faucetClaim: PublicKey) {
    let state = await this.program.account.faucetClaim.fetchNullable(
      faucetClaim
    );
    return state;
  }
}

export interface FaucetAccounts {
  auth: PublicKey;
  config: PublicKey;
  state: PublicKey;
  vault0: TokenVault;
  vault1: TokenVault;
  protocol: PublicKey;
}

export interface LeafProof {
  index: number;
  customIndex: BN;
  leaf: ArrayBufferLike;
  proof: Array<Buffer<ArrayBufferLike>>;
}

export class FaucetPda {
  seeds: FaucetSeeds;
  programId: PublicKey;

  constructor(programId: PublicKey) {
    this.programId = programId;
    this.seeds = new FaucetSeeds();
  }
  getAuthorityManagerAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.faucetAuthorityManager],
      this.programId
    );
  }
  getAuthorityAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.faucetAuthority],
      this.programId
    );
  }
  getFaucetVaultAddress(mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.faucetVault, mint.toBuffer()],
      this.programId
    );
  }
  getFaucetClaimAddress(mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.faucetClaim, mint.toBuffer()],
      this.programId
    );
  }
  getFaucetClaimShardAddress(faucetClaim: PublicKey, shard: number) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.faucetClaimShard, faucetClaim.toBuffer(), u16ToBytes(shard)],
      this.programId
    );
  }
}

export class FaucetSeeds {
  faucetAuthority: Buffer;
  faucetAuthorityManager: Buffer;
  faucetVault: Buffer;
  faucetClaim: Buffer;
  faucetClaimShard: Buffer;

  constructor() {
    this.faucetAuthority = this.toSeed("faucet_authority");
    this.faucetAuthorityManager = this.toSeed("faucet_authority_manager");
    this.faucetVault = this.toSeed("faucet_vault");
    this.faucetClaim = this.toSeed("faucet_claim");
    this.faucetClaimShard = this.toSeed("faucet_claim_shard");
  }

  toSeed(seed: string) {
    return Buffer.from(anchor.utils.bytes.utf8.encode(seed));
  }
}

export class FaucetMerkleLeaf {
  shard: PublicKey;
  address: PublicKey;
  index: BN;
  amount: BN;

  constructor(shard: PublicKey, address: PublicKey, index: BN, amount: BN) {
    this.shard = shard;
    this.address = address;
    this.amount = amount;
    this.index = index;
  }

  toBuffer() {
    let data = Buffer.from([
      ...this.shard.toBuffer(),
      ...this.address.toBuffer(),
      ...this.index.toArray("le", 2),
      ...this.amount.toArray("le", 8),
    ]);

    return data;
  }
  keccak256() {
    return keccak_256(this.toBuffer());
  }
}

export class FaucetMerkleTree {
  leafs: Array<FaucetMerkleLeaf>;
  tree: MerkleTree;

  constructor(leafs: Array<FaucetMerkleLeaf>) {
    this.leafs = leafs;

    this.tree = new MerkleTree(
      leafs.map((x) => x.keccak256()),
      keccak_256,
      {
        sort: true,
      }
    );
  }

  getLeaf(customIndex: BN): FaucetMerkleLeaf | null {
    let leaf = this.leafs.find((x) => x.index.eq(customIndex));
    if (!leaf) {
      return null;
    }

    return leaf;
  }

  // getIndexProof(index: number): LeafProof | null {
  //   let keccak = this.tree.getLeaf(index);
  //   let proof = this.tree.getProof(keccak, index).map((x) => x.data);
  //   return {
  //     index,
  //     leaf: keccak,
  //     proof,
  //   };
  // }

  getLeafProof(customIndex: BN): LeafProof | null {
    let leaf = this.getLeaf(customIndex);
    if (!leaf) {
      return null;
    }
    let keccak = Buffer.from(leaf.keccak256());

    let index = this.tree.getLeafIndex(keccak);
    if (index == -1) {
      return null;
    }

    let proof = this.tree.getProof(keccak, index).map((x) => x.data);

    return {
      index,
      customIndex: customIndex,
      leaf: keccak,
      proof,
    };
  }

  verify_custom_index(customIndex: BN): boolean | null {
    let leaf = this.getLeaf(customIndex);
    if (!leaf) {
      return null;
    }

    let keccak = Buffer.from(leaf.keccak256());

    let index = this.tree.getLeafIndex(keccak);
    if (index == -1) {
      return null;
    }

    let proof = this.tree.getProof(keccak, index);
    let root = this.tree.getRoot();
    return this.tree.verify(proof, keccak, root);
  }
}
