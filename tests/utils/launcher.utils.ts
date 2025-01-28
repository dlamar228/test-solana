import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Launcher } from "../../target/types/launcher";
import {
  PublicKey,
  Signer,
  SystemProgram,
  ConfirmOptions,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetProgram,
  TransactionSignature,
  Keypair,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { Mint, TokenUtils, TokenVault } from "./token.utils";
import { u16ToBytes } from "./utils";
import { getATAAddress, SYSTEM_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";
import { DexAccounts, DexUtils } from "./dex.utils";
import { FaucetUtils } from "./faucet.utils";

const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export interface InitializeDexArgs {
  dexUtils: DexUtils;
  faucetUtils: FaucetUtils;
  payerVault: TokenVault;
  mintAuthority: Mint;
  hasFaucet: boolean;
}

export class LauncherUtils {
  program: Program<Launcher>;
  pdaGetter: LauncherPda;
  confirmOptions: ConfirmOptions;

  constructor(program: Program<Launcher>, confirmOptions: ConfirmOptions) {
    this.program = program;
    this.confirmOptions = confirmOptions;
    this.pdaGetter = new LauncherPda(program.programId);
  }

  async initializeAuthorityManager(signer: Signer, faucetAuthority: PublicKey) {
    let [authority] = this.pdaGetter.getAuthorityAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();

    let authorityManagerState = await this.getAuthorityManagerState(
      authorityManager
    );
    if (authorityManagerState != null) {
      return authorityManager;
    }

    let tx = await this.program.methods
      .initializeAuthorityManager(faucetAuthority)
      .accounts({
        payer: signer.publicKey,
        authority,
        authorityManager,
      })
      .rpc();

    return authorityManager;
  }
  async updateAuthorityManagerAdmin(signer: Signer, admin: PublicKey) {
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();

    let tx = await this.program.methods
      .updateAuthorityManagerAdmin(admin)
      .accounts({
        payer: signer.publicKey,
        authorityManager,
      })
      .rpc();

    return tx;
  }
  async updateAuthorityManagerFaucetAuthority(
    signer: Signer,
    faucetAuthority: PublicKey
  ) {
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();

    let tx = await this.program.methods
      .updateAuthorityManagerFaucetAuthority(faucetAuthority)
      .accounts({
        payer: signer.publicKey,
        authorityManager,
      })
      .rpc();

    return tx;
  }
  async initializeConfig(signer: Signer) {
    let [config] = this.pdaGetter.getConfigAddress();
    let configState = await this.getConfigState(config);
    if (configState != null) {
      return config;
    }
    let tx = await this.program.methods
      .initializeConfig()
      .accounts({
        payer: signer.publicKey,
        config,
      })
      .rpc();

    return config;
  }
  async updateConfigFaucetTokens(signer: Signer, faucet_tokens: BN) {
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    let [config] = this.pdaGetter.getConfigAddress();

    let tx = await this.program.methods
      .updateConfigFaucetTokens(faucet_tokens)
      .accounts({
        payer: signer.publicKey,
        authorityManager,
        config,
      })
      .rpc();

    return tx;
  }
  async updateConfigTeamTokens(signer: Signer, team_tokens: BN) {
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    let [config] = this.pdaGetter.getConfigAddress();

    let tx = await this.program.methods
      .updateConfigTeamTokens(team_tokens)
      .accounts({
        payer: signer.publicKey,
        authorityManager,
        config,
      })
      .rpc();

    return tx;
  }
  async initializeDex(
    signer: Signer,
    args: InitializeDexArgs
  ): Promise<DexAccounts> {
    let payerVaultAuthority = getAssociatedTokenAddressSync(
      args.mintAuthority.address,
      signer.publicKey,
      false,
      args.mintAuthority.program
    );
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    let [authority] = this.pdaGetter.getAuthorityAddress();
    let [config] = this.pdaGetter.getConfigAddress();
    let [teamVault] = this.pdaGetter.getTeamVaultAddress(
      args.mintAuthority.address
    );

    let [dexAuthority] = args.dexUtils.pdaGetter.getAuthorityAddress();
    let [dexAuthorityManager] =
      args.dexUtils.pdaGetter.getAuthorityManagerAddress();
    let [dexConfig] = args.dexUtils.pdaGetter.getConfigStateAddress();

    let to_sort = [args.mintAuthority.address, args.payerVault.mint.address];

    to_sort.sort((x, y) => {
      const buffer1 = x.toBuffer();
      const buffer2 = y.toBuffer();

      for (let i = 0; i < buffer1.length && i < buffer2.length; i++) {
        if (buffer1[i] < buffer2[i]) {
          return -1;
        }
        if (buffer1[i] > buffer2[i]) {
          return 1;
        }
      }

      return buffer1.length - buffer2.length;
    });

    let [mint_0, mint_1] = to_sort;

    let [dexState] = args.dexUtils.pdaGetter.getDexStateAddress(mint_0, mint_1);

    let [dexVault] = args.dexUtils.pdaGetter.getDexVaultAddress(
      dexState,
      args.payerVault.mint.address
    );

    let [dexVaultAuthority] = args.dexUtils.pdaGetter.getDexVaultAddress(
      dexState,
      args.mintAuthority.address
    );

    let [faucetAuthority] = args.faucetUtils.pdaGetter.getAuthorityAddress();

    if (args.hasFaucet) {
      let faucetVault = await args.faucetUtils.initializeFaucetVault(
        signer,
        args.mintAuthority
      );
      await this.program.methods
        .initializeDexWithFaucet()
        .accounts({
          payer: signer.publicKey,
          payerVaultAuthority,
          authority,
          authorityManager,
          config,
          dexAuthority,
          dexAuthorityManager,
          dexConfig,
          dexProgram: args.dexUtils.program.programId,
          dexState,
          dexVault,
          dexVaultAuthority,
          mint: args.payerVault.mint.address,
          mintAuthority: args.mintAuthority.address,
          tokenProgramPayer: args.payerVault.mint.program,
          tokenProgramAuthority: args.mintAuthority.program,
          faucetAuthority,
          teamVault,
          faucetVault,
          payerVault: args.payerVault.address,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .rpc();
    } else {
      await this.program.methods
        .initializeDex()
        .accounts({
          payer: signer.publicKey,
          payerVaultAuthority,
          authority,
          authorityManager,
          config,
          dexAuthority,
          dexAuthorityManager,
          dexConfig,
          dexProgram: args.dexUtils.program.programId,
          dexState,
          dexVault,
          dexVaultAuthority,
          mint: args.payerVault.mint.address,
          mintAuthority: args.mintAuthority.address,
          tokenProgramPayer: args.payerVault.mint.program,
          tokenProgramAuthority: args.mintAuthority.program,
          faucetAuthority,
          teamVault,
          payerVault: args.payerVault.address,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .rpc();
    }

    let vault_zero = {
      address: dexVault,
      mint: args.payerVault.mint,
    };
    let vault_one = {
      address: dexVaultAuthority,
      mint: args.mintAuthority,
    };

    if (mint_0 == args.mintAuthority.address) {
      vault_zero = {
        address: dexVaultAuthority,
        mint: args.mintAuthority,
      };
      vault_one = {
        address: dexVault,
        mint: args.payerVault.mint,
      };
    }

    return {
      authority: dexAuthority,
      authorityManager: dexAuthorityManager,
      config: dexConfig,
      vaultZero: vault_zero,
      vaultOne: vault_one,
      dex: dexState,
    };
  }
  async createMint(
    signer: Signer,
    name: string,
    symbol: string,
    uri: string
  ): Promise<Mint> {
    let mint = new Keypair();
    let [metadata] = this.pdaGetter.getMintMetadataAddress(mint.publicKey);
    let [authority] = this.pdaGetter.getAuthorityAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();

    let tx = await this.program.methods
      .initializeMint(name, symbol, uri)
      .accounts({
        payer: signer.publicKey,
        mint: mint.publicKey,
        authority,
        authorityManager,
        metadataAccount: metadata,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .signers([mint])
      .rpc();

    return {
      authority,
      freezeAuthority: authority,
      decimals: 9,
      address: mint.publicKey,
      program: TOKEN_PROGRAM_ID,
    };
  }
  async withdrawTeamTokens(signer: Signer, vault: TokenVault) {
    let [authority] = this.pdaGetter.getAuthorityAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    let [teamVault] = this.pdaGetter.getTeamVaultAddress(vault.mint.address);
    let tx = await this.program.methods
      .withdrawTeamTokens()
      .accounts({
        admin: signer.publicKey,
        authority,
        authorityManager,
        teamVault,
        recipient: vault.address,
        mint: vault.mint.address,
        tokenProgram: vault.mint.program,
      })
      .rpc();

    return tx;
  }
  async getAuthorityManagerState(authorityManager: PublicKey) {
    return await this.program.account.authorityManager.fetchNullable(
      authorityManager
    );
  }
  async getConfigState(config: PublicKey) {
    return await this.program.account.configState.fetchNullable(config);
  }
}

export interface LauncherUtils {
  auth: PublicKey;
  config: PublicKey;
  state: PublicKey;
  vault0: TokenVault;
  vault1: TokenVault;
  protocol: PublicKey;
}

export class LauncherPda {
  seeds: LauncherSeeds;
  programId: PublicKey;

  constructor(programId: PublicKey) {
    this.programId = programId;
    this.seeds = new LauncherSeeds();
  }
  getAuthorityAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.launcherAuthority],
      this.programId
    );
  }
  getAuthorityManagerAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.launcherAuthorityManager],
      this.programId
    );
  }
  getConfigAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.launcherConfig],
      this.programId
    );
  }
  getTeamVaultAddress(mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.launcherTeamVault, mint.toBuffer()],
      this.programId
    );
  }
  getMintMetadataAddress(mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("metadata")),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
  }
}

export class LauncherSeeds {
  launcherAuthority: Buffer;
  launcherAuthorityManager: Buffer;
  launcherConfig: Buffer;
  launcherTeamVault: Buffer;
  launcherMetadata: Buffer;

  constructor() {
    this.launcherAuthority = this.toSeed("launcher_authority");
    this.launcherAuthorityManager = this.toSeed("launcher_authority_manager");
    this.launcherConfig = this.toSeed("launcher_config");
    this.launcherTeamVault = this.toSeed("launcher_team_vault");
    this.launcherMetadata = this.toSeed("metadata");
  }

  toSeed(seed: string) {
    return Buffer.from(anchor.utils.bytes.utf8.encode(seed));
  }
}
