import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Dex } from "../../target/types/dex";
import {
  PublicKey,
  Signer,
  SystemProgram,
  ConfirmOptions,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetProgram,
  TransactionSignature,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { Mint, TokenUtils, TokenVault } from "./token.utils";
import { RaydiumPda } from "./raydium.utils";
import { createPoolFeeReceive } from "./raydium.idl";
//import { SYSTEM_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";

export interface DexAccounts {
  authority: PublicKey;
  authorityManager: PublicKey;
  config: PublicKey;
  vaultZero: TokenVault;
  vaultOne: TokenVault;
  dex: PublicKey;
}

export interface UserVaults {
  user_zero: TokenVault;
  user_one: TokenVault;
}

export interface DexCreationArgs {
  config: PublicKey;
  initAmount0: BN;
  initAmount1: BN;
  vaultForReserveBound: boolean;
  reserveBoundGe: boolean;
  reserveBound: BN;
  openTime: BN;
  swapFeeRate: BN;
  launchFeeRate: BN;
  mint0: Mint;
  mint1: Mint;
  signerAta0: PublicKey;
  signerAta1: PublicKey;
}

export interface SwapBaseInputArgs {
  inputToken: PublicKey;
  inputTokenProgram: PublicKey;
  outputToken: PublicKey;
  outputTokenProgram: PublicKey;
  inputAta: PublicKey;
  outputAta: PublicKey;
  inputVault: PublicKey;
  outputVault: PublicKey;
  amountIn: BN;
  minimumAmountOut: BN;
  dexAccounts: DexAccounts;
}

export interface SwapBaseOutputArgs {
  inputToken: PublicKey;
  inputTokenProgram: PublicKey;
  outputToken: PublicKey;
  outputTokenProgram: PublicKey;
  inputAta: PublicKey;
  outputAta: PublicKey;
  inputVault: PublicKey;
  outputVault: PublicKey;
  maxAmountIn: BN;
  amountOutLessFee: BN;
  dexAccounts: DexAccounts;
}

export interface LaunchDexArgs {
  cpSwapProgram: PublicKey;
  raydiumAmmConfig: PublicKey;
  raydiumPdaGetter: RaydiumPda;
  dexAccounts: DexAccounts;
  sharedLamports: BN;
}

export class DexUtils {
  program: Program<Dex>;
  pdaGetter: DexPda;
  confirmOptions: ConfirmOptions;

  constructor(program: Program<Dex>, confirmOptions: ConfirmOptions) {
    this.program = program;
    this.confirmOptions = confirmOptions;
    this.pdaGetter = new DexPda(program.programId);
  }
  async initializeAuthorityManager(signer: Signer, cpi_authority: PublicKey) {
    let [authority] = this.pdaGetter.getAuthorityAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();

    let authorityManagerState = await this.getAuthorityManagerState(
      authorityManager
    );
    if (authorityManagerState != null) {
      return authorityManager;
    }

    await this.program.methods
      .initializeAuthorityManager(cpi_authority)
      .accounts({
        payer: signer.publicKey,
        authorityManager,
        authority,
      })
      .rpc();
    return authorityManager;
  }
  async initializeConfig(payer: Signer) {
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    let [config] = this.pdaGetter.getConfigStateAddress();

    let configState = await this.getConfigState(config);
    if (configState != null) {
      return config;
    }

    await this.program.methods
      .initializeConfig()
      .accounts({
        admin: payer.publicKey,
        authorityManager,
        config,
      })
      .rpc();

    return config;
  }
  async swapBaseInput(
    signer: Signer,
    args: SwapBaseInputArgs
  ): Promise<TransactionSignature> {
    return await this.program.methods
      .swapBaseInput(args.amountIn, args.minimumAmountOut)
      .accounts({
        payer: signer.publicKey,
        // signer ata accounts
        inputTokenAccount: args.inputAta,
        outputTokenAccount: args.outputAta,
        inputTokenProgram: args.inputTokenProgram,
        outputTokenProgram: args.outputTokenProgram,
        // dex accounts
        authority: args.dexAccounts.authority,
        dexState: args.dexAccounts.dex,
        inputVault: args.inputVault,
        outputVault: args.outputVault,
        inputTokenMint: args.inputToken,
        outputTokenMint: args.outputToken,
        config: args.dexAccounts.config,
        authorityManager: args.dexAccounts.authorityManager,
      })
      .rpc(this.confirmOptions);
  }
  async swapBaseOutput(
    signer: Signer,
    args: SwapBaseOutputArgs
  ): Promise<TransactionSignature> {
    return await this.program.methods
      .swapBaseOutput(args.maxAmountIn, args.amountOutLessFee)
      .accounts({
        payer: signer.publicKey,
        // signer ata accounts
        inputTokenAccount: args.inputAta,
        outputTokenAccount: args.outputAta,
        inputTokenProgram: args.inputTokenProgram,
        outputTokenProgram: args.outputTokenProgram,
        // dex accounts
        authority: args.dexAccounts.authority,
        dexState: args.dexAccounts.dex,
        inputVault: args.inputVault,
        outputVault: args.outputVault,
        inputTokenMint: args.inputToken,
        outputTokenMint: args.outputToken,
        config: args.dexAccounts.config,
        authorityManager: args.dexAccounts.authorityManager,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc(this.confirmOptions);
  }
  async launchDex(
    signer: Signer,
    args: LaunchDexArgs
  ): Promise<TransactionSignature> {
    let [auth] = args.raydiumPdaGetter.getAuthAddress();
    let [state] = args.raydiumPdaGetter.getStateAddress(
      args.raydiumAmmConfig,
      args.dexAccounts.vaultZero.mint.address,
      args.dexAccounts.vaultOne.mint.address
    );
    let [vault0] = args.raydiumPdaGetter.getVaultAddress(
      state,
      args.dexAccounts.vaultZero.mint.address
    );
    let [vault1] = args.raydiumPdaGetter.getVaultAddress(
      state,
      args.dexAccounts.vaultOne.mint.address
    );
    let [oracle] = args.raydiumPdaGetter.getOracleAddress(state);
    let [lpMint] = args.raydiumPdaGetter.getLpMintAddress(state);
    let [creatorLpToken] = PublicKey.findProgramAddressSync(
      [
        args.dexAccounts.authority.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        lpMint.toBuffer(),
      ],
      ASSOCIATED_PROGRAM_ID
    );

    return await this.program.methods
      .launchDex(args.sharedLamports)
      .accounts({
        dexAuthority: args.dexAccounts.authority,
        dexConfig: args.dexAccounts.config,
        dexState: args.dexAccounts.dex,
        cpSwapProgram: args.cpSwapProgram,
        payer: signer.publicKey,
        dexAuthorityManager: args.dexAccounts.authorityManager,
        ammConfig: args.raydiumAmmConfig,
        authority: auth,
        poolState: state,
        token0Mint: args.dexAccounts.vaultZero.mint.address,
        token1Mint: args.dexAccounts.vaultOne.mint.address,
        creatorToken0: args.dexAccounts.vaultZero.address,
        creatorToken1: args.dexAccounts.vaultOne.address,
        token0Vault: vault0,
        token1Vault: vault1,
        tokenProgram: TOKEN_PROGRAM_ID,
        token0Program: args.dexAccounts.vaultZero.mint.program,
        token1Program: args.dexAccounts.vaultOne.mint.program,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        observationState: oracle,
        lpMint,
        createPoolFee: createPoolFeeReceive,
        creatorLpToken,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
      ])
      .rpc(this.confirmOptions);
  }
  async updateAuthorityManagerAdmin(signer: Signer, new_admin: PublicKey) {
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    return await this.program.methods
      .updateAuthorityManagerAdmin(new_admin)
      .accounts({
        payer: signer.publicKey,
        authorityManager,
      })
      .rpc(this.confirmOptions);
  }
  async updateAuthorityManagerCpiAuthority(
    signer: Signer,
    cpi_authority: PublicKey
  ) {
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    return await this.program.methods
      .updateAuthorityManagerCpiAuthority(cpi_authority)
      .accounts({
        payer: signer.publicKey,
        authorityManager,
      })
      .rpc(this.confirmOptions);
  }
  async updateLaunchFeeRate(signer: Signer, newFeeRate: BN) {
    let [config] = this.pdaGetter.getConfigStateAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    return await this.program.methods
      .updateConfigLaunchFeeRate(newFeeRate)
      .accounts({
        admin: signer.publicKey,
        config,
        authorityManager,
      })
      .rpc(this.confirmOptions);
  }
  async updateSwapFeeRate(signer: Signer, newSwapRate: BN) {
    let [config] = this.pdaGetter.getConfigStateAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    return await this.program.methods
      .updateConfigSwapFeeRate(newSwapRate)
      .accounts({
        admin: signer.publicKey,
        authorityManager,
        config,
      })
      .rpc(this.confirmOptions);
  }
  async updateInitialReserve(signer: Signer, initialReserve: BN) {
    let [config] = this.pdaGetter.getConfigStateAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    return await this.program.methods
      .updateConfigInitialReserve(initialReserve)
      .accounts({
        admin: signer.publicKey,
        authorityManager,
        config,
      })
      .rpc(this.confirmOptions);
  }
  async updateVaultReserveBound(signer: Signer, vaultReserveBound: BN) {
    let [config] = this.pdaGetter.getConfigStateAddress();
    let [authorityManager] = this.pdaGetter.getAuthorityManagerAddress();
    return await this.program.methods
      .updateConfigVaultReserveBound(vaultReserveBound)
      .accounts({
        admin: signer.publicKey,
        authorityManager,
        config,
      })
      .rpc(this.confirmOptions);
  }
  async dexIsReadyToLaunch(dexState: PublicKey) {
    return (await this.program.account.dexState.fetchNullable(dexState))
      .isReadyToLaunch;
  }
  async dexIsLaunched(dexState: PublicKey) {
    return (await this.program.account.dexState.fetchNullable(dexState))
      .isLaunched;
  }
  async getAuthorityManagerState(authorityManager: PublicKey) {
    return await this.program.account.authorityManager.fetchNullable(
      authorityManager
    );
  }
  async getDexState(dexState: PublicKey) {
    return await this.program.account.dexState.fetchNullable(dexState);
  }
  async getConfigState(config: PublicKey) {
    return await this.program.account.configState.fetchNullable(config);
  }
}

export class DexPda {
  seeds: DexSeeds;
  programId: PublicKey;

  constructor(programId: PublicKey) {
    this.programId = programId;
    this.seeds = new DexSeeds();
  }
  getAuthorityManagerAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dexAuthorityManager],
      this.programId
    );
  }
  getAuthorityAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dexAuthority],
      this.programId
    );
  }
  getConfigStateAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dexConfig],
      this.programId
    );
  }
  getDexStateAddress(mint0: PublicKey, mint1: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dexState, mint0.toBuffer(), mint1.toBuffer()],
      this.programId
    );
  }
  getDexVaultAddress(state: PublicKey, mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dexVault, state.toBuffer(), mint.toBuffer()],
      this.programId
    );
  }
}

export class DexSeeds {
  dexAuthorityManager: Buffer;
  dexAuthority: Buffer;
  dexConfig: Buffer;
  dexState: Buffer;
  dexVault: Buffer;

  constructor() {
    this.dexAuthorityManager = this.toSeed("dex_authority_manager");
    this.dexAuthority = this.toSeed("dex_authority");
    this.dexConfig = this.toSeed("dex_config");
    this.dexState = this.toSeed("dex_state");
    this.dexVault = this.toSeed("dex_vault");
  }

  toSeed(seed: string) {
    return Buffer.from(anchor.utils.bytes.utf8.encode(seed));
  }
}
