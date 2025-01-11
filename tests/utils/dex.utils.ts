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
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { Mint, TokenUtils, TokenVault } from "./token.utils";
import { u16ToBytes } from "./utils";
import { RaydiumAccounts, RaydiumPda } from "./raydium.utils";
import { createPoolFeeReceive } from "./raydium.idl";
import { SYSTEM_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";

export interface ConfigCreationArgs {
  index: number;
}

export interface DexCreationArgs {
  config: PublicKey;
  initAmount0: BN;
  initAmount1: BN;
  reserveBound: BN;
  openTime: BN;
  protocolFeeRate: BN;
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

  async initializeConfig(signer: Signer, args: ConfigCreationArgs) {
    let [config] = this.pdaGetter.getConfigAddress(args.index);
    await this.program.methods
      .initializeConfig(args.index)
      .accounts({
        owner: signer.publicKey,
        config,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc();
    return config;
  }
  async initializeDex(
    signer: Signer,
    args: DexCreationArgs
  ): Promise<DexAccounts> {
    let [auth] = this.pdaGetter.getAuthAddress();
    let [state] = this.pdaGetter.getStateAddress(
      args.config,
      args.mint0.address,
      args.mint1.address
    );
    let [vault0] = this.pdaGetter.getVaultAddress(state, args.mint0.address);
    let [vault1] = this.pdaGetter.getVaultAddress(state, args.mint1.address);

    await this.program.methods
      .initializeDex(
        args.initAmount0,
        args.initAmount1,
        args.openTime,
        args.reserveBound,
        args.protocolFeeRate,
        args.launchFeeRate
      )
      .accounts({
        creator: signer.publicKey,
        config: args.config,
        authority: auth,
        dexState: state,
        token0Mint: args.mint0.address,
        token1Mint: args.mint1.address,
        creatorToken0: args.signerAta0,
        creatorToken1: args.signerAta1,
        token0Vault: vault0,
        token1Vault: vault1,
        tokenProgram: TOKEN_PROGRAM_ID,
        token0Program: args.mint0.program,
        token1Program: args.mint1.program,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc();
    return {
      auth,
      config: args.config,
      state,
      vault0: {
        mint: args.mint0,
        address: vault0,
      },
      vault1: {
        mint: args.mint1,
        address: vault1,
      },
    };
  }
  async fundDexAuth(
    from: Signer,
    to: PublicKey,
    lamports: number
  ): Promise<TransactionSignature> {
    let transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to,
        lamports,
      })
    );
    let transferTx = await sendAndConfirmTransaction(
      this.program.provider.connection,
      transaction,
      [from],
      this.confirmOptions
    );
    return transferTx;
  }

  async refundDexAuth(
    admin: Signer,
    dexState: PublicKey,
    dexAuthority: PublicKey,
    config: PublicKey
  ): Promise<TransactionSignature> {
    return await this.program.methods
      .refundDexAuth()
      .accounts({
        admin: admin.publicKey,
        dexAuthority,
        config,
        dexState,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc(this.confirmOptions);
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
        authority: args.dexAccounts.auth,
        dexState: args.dexAccounts.state,
        inputVault: args.inputVault,
        outputVault: args.outputVault,
        inputTokenMint: args.inputToken,
        outputTokenMint: args.outputToken,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
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
        authority: args.dexAccounts.auth,
        dexState: args.dexAccounts.state,
        inputVault: args.inputVault,
        outputVault: args.outputVault,
        inputTokenMint: args.inputToken,
        outputTokenMint: args.outputToken,
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
      args.dexAccounts.vault0.mint.address,
      args.dexAccounts.vault1.mint.address
    );
    let [vault0] = args.raydiumPdaGetter.getVaultAddress(
      state,
      args.dexAccounts.vault0.mint.address
    );
    let [vault1] = args.raydiumPdaGetter.getVaultAddress(
      state,
      args.dexAccounts.vault1.mint.address
    );
    let [oracle] = args.raydiumPdaGetter.getOracleAddress(state);
    let [lpMint] = args.raydiumPdaGetter.getLpMintAddress(state);
    let [creatorLpToken] = PublicKey.findProgramAddressSync(
      [
        args.dexAccounts.auth.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        lpMint.toBuffer(),
      ],
      ASSOCIATED_PROGRAM_ID
    );

    return await this.program.methods
      .launch()
      .accounts({
        dexAuthority: args.dexAccounts.auth,
        dexConfig: args.dexAccounts.config,
        dexState: args.dexAccounts.state,
        cpSwapProgram: args.cpSwapProgram,
        payer: signer.publicKey,
        ammConfig: args.raydiumAmmConfig,
        authority: auth,
        poolState: state,
        token0Mint: args.dexAccounts.vault0.mint.address,
        token1Mint: args.dexAccounts.vault1.mint.address,
        creatorToken0: args.dexAccounts.vault0.address,
        creatorToken1: args.dexAccounts.vault1.address,
        token0Vault: vault0,
        token1Vault: vault1,
        tokenProgram: TOKEN_PROGRAM_ID,
        token0Program: args.dexAccounts.vault0.mint.program,
        token1Program: args.dexAccounts.vault0.mint.program,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        observationState: oracle,
        lpMint,
        createPoolFee: createPoolFeeReceive,
        creatorLpToken,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc(this.confirmOptions);
  }
  async isReadyToLaunch(state: PublicKey) {
    return (await this.program.account.dexState.fetchNullable(state))
      .isReadyToLaunch;
  }
  async isLaunched(state: PublicKey) {
    return (await this.program.account.dexState.fetchNullable(state))
      .isLaunched;
  }
  async getDexState(state: PublicKey) {
    return await this.program.account.dexState.fetchNullable(state);
  }
  async getConfigState(config: PublicKey) {
    return await this.program.account.config.fetchNullable(config);
  }
}

export interface DexAccounts {
  auth: PublicKey;
  config: PublicKey;
  state: PublicKey;
  vault0: TokenVault;
  vault1: TokenVault;
}

export class DexPda {
  seeds: DexSeeds;
  programId: PublicKey;

  constructor(programId: PublicKey) {
    this.programId = programId;
    this.seeds = new DexSeeds();
  }
  getAuthAddress() {
    return PublicKey.findProgramAddressSync([this.seeds.auth], this.programId);
  }
  getConfigAddress(index: number) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.config, u16ToBytes(index)],
      this.programId
    );
  }
  getStateAddress(amm: PublicKey, mint0: PublicKey, mint1: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dex, amm.toBuffer(), mint0.toBuffer(), mint1.toBuffer()],
      this.programId
    );
  }
  getVaultAddress(state: PublicKey, mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.vault, state.toBuffer(), mint.toBuffer()],
      this.programId
    );
  }
}

export class DexSeeds {
  auth: Buffer;
  config: Buffer;
  dex: Buffer;
  vault: Buffer;

  constructor() {
    this.auth = this.toSeed("dex_auth");
    this.config = this.toSeed("dex_config");
    this.dex = this.toSeed("dex_state");
    this.vault = this.toSeed("dex_vault");
  }

  toSeed(seed: string) {
    return Buffer.from(anchor.utils.bytes.utf8.encode(seed));
  }
}

var index = 0;
export function nextIndex() {
  index += 1;
  return index;
}
