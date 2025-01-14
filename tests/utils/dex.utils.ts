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
import { RaydiumPda } from "./raydium.utils";
import { createPoolFeeReceive } from "./raydium.idl";
import { SYSTEM_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";

export interface ConfigCreationArgs {
  admin: PublicKey;
  index: number;
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
  async initializeDexProtocol(signer: Signer) {
    let [protocol] = this.pdaGetter.getProtocolAddress();

    let protocolState = await this.getProtocolState(protocol);
    if (protocolState != null) {
      return protocol;
    }

    await this.program.methods
      .initializeProtocol()
      .accounts({
        signer: signer.publicKey,
        protocol,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc();
    return protocol;
  }
  async initializeDexConfig(protocolAdmin: Signer, args: ConfigCreationArgs) {
    let [protocol] = this.pdaGetter.getProtocolAddress();
    let [config] = this.pdaGetter.getConfigStateAddress(args.index);
    await this.program.methods
      .initializeConfig(args.admin, args.index)
      .accounts({
        signer: protocolAdmin.publicKey,
        protocol,
        config,
        systemProgram: SYSTEM_PROGRAM_ID,
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
    let [auth] = this.pdaGetter.getAuthorityAddress();
    let [state] = this.pdaGetter.getDexStateAddress(
      args.config,
      args.mint0.address,
      args.mint1.address
    );
    let [vault0] = this.pdaGetter.getDexVaultAddress(state, args.mint0.address);
    let [vault1] = this.pdaGetter.getDexVaultAddress(state, args.mint1.address);

    await this.program.methods
      .initializeDex(
        args.initAmount0,
        args.initAmount1,
        args.openTime,
        args.vaultForReserveBound,
        args.reserveBoundGe,
        args.reserveBound,
        args.swapFeeRate,
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
  async updateDexAdmin(
    signer: Signer,
    config: PublicKey,
    new_admin: PublicKey
  ) {
    return await this.program.methods
      .updateConfigAdmin(new_admin)
      .accounts({
        admin: signer.publicKey,
        config,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc(this.confirmOptions);
  }
  async updateDexLaunchFeeRate(
    signer: Signer,
    config: PublicKey,
    dexState: PublicKey,
    newFeeRate: BN
  ) {
    return await this.program.methods
      .updateLaunchFeeRate(newFeeRate)
      .accounts({
        admin: signer.publicKey,
        config,
        dexState,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc(this.confirmOptions);
  }
  async updateDexSwapFeeRate(
    signer: Signer,
    config: PublicKey,
    dexState: PublicKey,
    newSwapRate: BN
  ) {
    return await this.program.methods
      .updateSwapFeeRate(newSwapRate)
      .accounts({
        admin: signer.publicKey,
        config,
        dexState,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc(this.confirmOptions);
  }
  async updateDexReserveBound(
    signer: Signer,
    config: PublicKey,
    dexState: PublicKey,
    newReserveBound: BN
  ) {
    return await this.program.methods
      .updateReserveBound(newReserveBound)
      .accounts({
        admin: signer.publicKey,
        config,
        dexState,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
      .rpc(this.confirmOptions);
  }
  async updateConfigCreateDex(
    signer: Signer,
    config: PublicKey,
    createDex: boolean
  ) {
    return await this.program.methods
      .updateCreateDex(createDex)
      .accounts({
        admin: signer.publicKey,
        config,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ])
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
  async getProtocolState(protocol: PublicKey) {
    return await this.program.account.protocolState.fetchNullable(protocol);
  }
  async getDexState(dexState: PublicKey) {
    return await this.program.account.dexState.fetchNullable(dexState);
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
  getProtocolAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dexProtocol],
      this.programId
    );
  }
  getAuthorityAddress() {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dexAuthority],
      this.programId
    );
  }
  getConfigStateAddress(index: number) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dexConfig, u16ToBytes(index)],
      this.programId
    );
  }
  getDexStateAddress(amm: PublicKey, mint0: PublicKey, mint1: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.dexState, amm.toBuffer(), mint0.toBuffer(), mint1.toBuffer()],
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
  dexProtocol: Buffer;
  dexAuthority: Buffer;
  dexConfig: Buffer;
  dexState: Buffer;
  dexVault: Buffer;

  constructor() {
    this.dexProtocol = this.toSeed("dex_protocol");
    this.dexAuthority = this.toSeed("dex_auth");
    this.dexConfig = this.toSeed("dex_config");
    this.dexState = this.toSeed("dex_state");
    this.dexVault = this.toSeed("dex_vault");
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
