import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Faucet } from "../../target/types/faucet";
import {
  PublicKey,
  Signer,
  ConfirmOptions,
  TransactionSignature,
} from "@solana/web3.js";
import { TokenVault } from "./token.utils";
import { u16ToBytes } from "./utils";

import MerkleTree from "merkletreejs";
import { keccak_256 } from "@noble/hashes/sha3";

export interface InitializeFaucetClaimArgs {
  totalFaucetAmount: BN;
  payerVault: TokenVault;
}

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

export class FaucetUtils {
  program: Program<Faucet>;
  pdaGetter: FaucetPda;
  confirmOptions: ConfirmOptions;

  constructor(program: Program<Faucet>, confirmOptions: ConfirmOptions) {
    this.program = program;
    this.confirmOptions = confirmOptions;
    this.pdaGetter = new FaucetPda(program.programId);
  }
  async initializeFaucetAuthorityManager(signer: Signer) {
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
  async initializeFaucetClaim(
    signer: Signer,
    args: InitializeFaucetClaimArgs
  ): Promise<FaucetClaimAccounts> {
    let [authority] = this.pdaGetter.getAuthorityAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    let [faucetClaim] = this.pdaGetter.getFaucetClaimAddress(
      args.payerVault.mint.address
    );
    let [faucetVault] = this.pdaGetter.getFaucetVaultAddress(
      faucetClaim,
      args.payerVault.mint.address
    );

    await this.program.methods
      .initializeFaucetClaim(args.totalFaucetAmount)
      .accounts({
        payer: signer.publicKey,
        payerVault: args.payerVault.address,
        authorityManager,
        authority,
        faucetClaim,
        mint: args.payerVault.mint.address,
        faucetVault,
        tokenProgram: args.payerVault.mint.program,
      })
      .rpc();

    return {
      authority,
      authorityManager,
      faucetClaim,
      faucetVault: {
        address: faucetVault,
        mint: args.payerVault.mint,
      },
      shards: [],
    };
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
        payer: signer.publicKey,
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
  async isAuthorityManagerInit(authorityManager: PublicKey): Promise<boolean> {
    let state = await this.program.account.authorityManager.fetchNullable(
      authorityManager
    );

    return state !== null;
  }
  async geAuthorityManagerAdmins(
    authorityManager: PublicKey
  ): Promise<PublicKey[]> {
    let state = await this.program.account.authorityManager.fetchNullable(
      authorityManager
    );

    return state.admins;
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
  getFaucetVaultAddress(faucetClaim: PublicKey, mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.faucetVault, faucetClaim.toBuffer(), mint.toBuffer()],
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
  address: PublicKey;
  amount: BN;

  constructor(address: PublicKey, amount: BN) {
    this.address = address;
    this.amount = amount;
  }

  toBuffer() {
    let data = Buffer.from([
      ...this.address.toBuffer(),
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

  getLeaf(address: PublicKey): FaucetMerkleLeaf | null {
    let leaf = this.leafs.find((x) => x.address.equals(address));
    if (!leaf) {
      return null;
    }

    return leaf;
  }

  getIndexProof(index: number): LeafProof | null {
    let keccak = this.tree.getLeaf(index);
    let proof = this.tree.getProof(keccak, index).map((x) => x.data);
    return {
      index,
      leaf: keccak,
      proof,
    };
  }

  getLeafProof(address: PublicKey): LeafProof | null {
    let leaf = this.getLeaf(address);
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
      leaf: keccak,
      proof,
    };
  }

  verify_address(address: PublicKey): boolean | null {
    let leaf = this.getLeaf(address);
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
