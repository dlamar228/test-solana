import { LAMPORTS_PER_SOL, Signer } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { MintPair, TokenUtils } from "./token.utils";
import {
  DexAccounts,
  DexCreationArgs,
  DexUtils,
  nextIndex,
  SwapBaseInputArgs,
  SwapBaseOutputArgs,
} from "./dex.utils";
import { SwapBaseResult, SwapCalculator } from "./curve";
import { sleep } from "./utils";

export interface SetupInputSwap {
  mints: MintPair;
  dexCreationArgs: DexCreationArgs;
  dexAccounts: DexAccounts;
  swapBaseInputArgs: SwapBaseInputArgs;
  swapInputExpected: SwapBaseResult;
}

export interface SetupOutputSwap {
  mints: MintPair;
  dexCreationArgs: DexCreationArgs;
  dexAccounts: DexAccounts;
  swapBaseOutputArgs: SwapBaseOutputArgs;
  swapOutputExpected: SwapBaseResult;
}

export class SetupSwapTest {
  tokenUtils: TokenUtils;
  dexUtils: DexUtils;
  zeroToOne: boolean;
  initAmount0: BN;
  initAmount1: BN;
  vaultForReserveBound: boolean;
  reserveBoundGe: boolean;
  reserveBound: BN;
  swapFeeRate: BN;
  launchFeeRate: BN;

  constructor(tokenUtils: TokenUtils, dexUtils: DexUtils) {
    this.tokenUtils = tokenUtils;
    this.dexUtils = dexUtils;
    this.zeroToOne = true;
    this.initAmount0 = new BN(3000);
    this.initAmount1 = new BN(6000);
    this.vaultForReserveBound = false;
    this.reserveBoundGe = true;
    this.reserveBound = new BN(3100);
    this.swapFeeRate = new BN(25_000);
    this.launchFeeRate = new BN(10_000);
  }

  async setupDex(
    signer: Signer,
    mints: MintPair
  ): Promise<[DexAccounts, DexCreationArgs]> {
    await this.dexUtils.initializeDexProtocol(signer);

    let dexConfigArgs = {
      index: nextIndex(),
      admin: signer.publicKey,
    };
    let dexConfig = await this.dexUtils.initializeDexConfig(
      signer,
      dexConfigArgs
    );

    let dexCreationArgs = {
      config: dexConfig,
      initAmount0: this.initAmount0,
      initAmount1: this.initAmount1,
      vaultForReserveBound: this.vaultForReserveBound,
      reserveBoundGe: this.reserveBoundGe,
      reserveBound: this.reserveBound,
      openTime: new BN(0),
      mint0: mints.mint0,
      mint1: mints.mint1,
      signerAta0: mints.ata0,
      signerAta1: mints.ata1,
      swapFeeRate: this.swapFeeRate,
      launchFeeRate: this.launchFeeRate,
    };
    let dexAccounts = await this.dexUtils.initializeDex(
      signer,
      dexCreationArgs
    );

    await sleep(1000);

    return [dexAccounts, dexCreationArgs];
  }

  async swapBaseInputCalculator(
    dexAccounts: DexAccounts,
    amountIn: BN,
    minimumAmountOut: BN
  ): Promise<SwapBaseResult> {
    let calculator = new SwapCalculator();
    let inputVault = this.zeroToOne ? dexAccounts.vault0 : dexAccounts.vault1;
    let outputVault = this.zeroToOne ? dexAccounts.vault1 : dexAccounts.vault0;

    let [
      dexState,
      inputVaultBalance,
      outputVaultBalance,
      inputMintConfig,
      outputMintConfig,
      epoch,
    ] = await Promise.all([
      this.dexUtils.getDexState(dexAccounts.state),
      this.tokenUtils.getBalance(inputVault.address),
      this.tokenUtils.getBalance(outputVault.address),
      this.tokenUtils.getTransferFeeConfig(
        inputVault.mint.address,
        inputVault.mint.program
      ),
      this.tokenUtils.getTransferFeeConfig(
        outputVault.mint.address,
        outputVault.mint.program
      ),
      this.tokenUtils.getEpoch(),
    ]);

    let result = calculator.swapBaseInput({
      swapFeeRate: dexState.swapFeeRate,
      inputProtocolFee: dexState.swapFeesToken0,
      outputProtocolFee: dexState.swapFeesToken1,
      inputMintConfig,
      outputMintConfig,
      inputVault: inputVaultBalance,
      outputVault: outputVaultBalance,
      amountIn,
      minimumAmountOut,
      epoch: BigInt(epoch),
    });

    return result;
  }

  async setupSwapBaseInput(
    signer: Signer,
    mints: MintPair,
    amountIn: BN = new BN(1000),
    minimumAmountOut: BN = new BN(250)
  ): Promise<SetupInputSwap> {
    let [dexAccounts, dexCreationArgs] = await this.setupDex(signer, mints);

    let swapBaseInputArgs = this.zeroToOne
      ? {
          inputToken: dexAccounts.vault0.mint.address,
          inputTokenProgram: dexAccounts.vault0.mint.program,
          outputToken: dexAccounts.vault1.mint.address,
          outputTokenProgram: dexAccounts.vault1.mint.program,
          inputAta: mints.ata0,
          outputAta: mints.ata1,
          inputVault: dexAccounts.vault0.address,
          outputVault: dexAccounts.vault1.address,
          amountIn,
          minimumAmountOut,
          dexAccounts: dexAccounts,
        }
      : {
          inputToken: dexAccounts.vault1.mint.address,
          inputTokenProgram: dexAccounts.vault1.mint.program,
          outputToken: dexAccounts.vault0.mint.address,
          outputTokenProgram: dexAccounts.vault0.mint.program,
          inputAta: mints.ata1,
          outputAta: mints.ata0,
          inputVault: dexAccounts.vault1.address,
          outputVault: dexAccounts.vault0.address,
          amountIn,
          minimumAmountOut,
          dexAccounts: dexAccounts,
        };

    let swapInputExpected = await this.swapBaseInputCalculator(
      dexAccounts,
      amountIn,
      minimumAmountOut
    );

    return {
      mints,
      dexAccounts,
      swapBaseInputArgs,
      swapInputExpected,
      dexCreationArgs,
    };
  }

  async swapOutputCalculator(
    dexAccounts: DexAccounts,
    maxAmountIn: BN,
    amountOutLessFee: BN
  ): Promise<SwapBaseResult> {
    let calculator = new SwapCalculator();
    let inputVault = this.zeroToOne ? dexAccounts.vault0 : dexAccounts.vault1;
    let outputVault = this.zeroToOne ? dexAccounts.vault1 : dexAccounts.vault0;

    let [
      dexState,
      inputVaultBalance,
      outputVaultBalance,
      inputMintConfig,
      outputMintConfig,
      epoch,
    ] = await Promise.all([
      this.dexUtils.getDexState(dexAccounts.state),
      this.tokenUtils.getBalance(inputVault.address),
      this.tokenUtils.getBalance(outputVault.address),
      this.tokenUtils.getTransferFeeConfig(
        inputVault.mint.address,
        inputVault.mint.program
      ),
      this.tokenUtils.getTransferFeeConfig(
        outputVault.mint.address,
        outputVault.mint.program
      ),
      this.tokenUtils.getEpoch(),
    ]);

    let result = calculator.swapBaseOutput({
      swapFeeRate: dexState.swapFeeRate,
      inputProtocolFee: dexState.swapFeesToken0,
      outputProtocolFee: dexState.swapFeesToken1,
      inputMintConfig,
      outputMintConfig,
      inputVault: inputVaultBalance,
      outputVault: outputVaultBalance,
      maxAmountIn,
      amountOutLessFee,
      epoch: BigInt(epoch),
    });

    return result;
  }

  async setupSwapBaseOutput(
    signer: Signer,
    mints: MintPair,
    maxAmountIn: BN = new BN(1000),
    amountOutLessFee: BN = new BN(100)
  ): Promise<SetupOutputSwap> {
    let [dexAccounts, dexCreationArgs] = await this.setupDex(signer, mints);

    let swapBaseOutputArgs = this.zeroToOne
      ? {
          inputToken: dexAccounts.vault0.mint.address,
          inputTokenProgram: dexAccounts.vault0.mint.program,
          outputToken: dexAccounts.vault1.mint.address,
          outputTokenProgram: dexAccounts.vault1.mint.program,
          inputAta: mints.ata0,
          outputAta: mints.ata1,
          inputVault: dexAccounts.vault0.address,
          outputVault: dexAccounts.vault1.address,
          maxAmountIn,
          amountOutLessFee,
          dexAccounts,
        }
      : {
          inputToken: dexAccounts.vault1.mint.address,
          inputTokenProgram: dexAccounts.vault1.mint.program,
          outputToken: dexAccounts.vault0.mint.address,
          outputTokenProgram: dexAccounts.vault0.mint.program,
          inputAta: mints.ata1,
          outputAta: mints.ata0,
          inputVault: dexAccounts.vault1.address,
          outputVault: dexAccounts.vault0.address,
          maxAmountIn,
          amountOutLessFee,
          dexAccounts,
        };

    let swapOutputExpected = await this.swapOutputCalculator(
      dexAccounts,
      swapBaseOutputArgs.maxAmountIn,
      swapBaseOutputArgs.amountOutLessFee
    );

    return {
      mints,
      dexAccounts,
      swapBaseOutputArgs,
      swapOutputExpected,
      dexCreationArgs,
    };
  }
}
