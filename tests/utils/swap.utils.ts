import { LAMPORTS_PER_SOL, PublicKey, Signer } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Mint, MintPair, TokenUtils, TokenVault } from "./token.utils";
import {
  DexAccounts,
  DexCreationArgs,
  DexUtils,
  SwapBaseInputArgs,
  SwapBaseOutputArgs,
} from "./dex.utils";
import { SwapBaseResult, SwapCalculator } from "./curve";
import {
  FaucetMerkleLeaf,
  FaucetMerkleTree,
  FaucetUtils,
} from "./faucet.utils";
import { LauncherUtils } from "./launcher.utils";
import { sleep } from "./utils";

export interface SetupInputSwap {
  dexAccounts: DexAccounts;
  swapBaseInputArgs: SwapBaseInputArgs;
  swapInputExpected: SwapBaseResult;
  atas: Atas;
  vaultForReserveBound: boolean;
  zeroToOne: boolean;
}

export interface Atas {
  vaultZero: TokenVault;
  vaultOne: TokenVault;
}

export interface SetupOutputSwap {
  dexAccounts: DexAccounts;
  swapBaseOutputArgs: SwapBaseOutputArgs;
  swapOutputExpected: SwapBaseResult;
  atas: Atas;
  vaultForReserveBound: boolean;
  zeroToOne: boolean;
}

export class SetupSwapTest {
  tokenUtils: TokenUtils;
  faucetUtils: FaucetUtils;
  launcherUtils: LauncherUtils;
  dexUtils: DexUtils;

  constructor(
    tokenUtils: TokenUtils,
    dexUtils: DexUtils,
    faucetUtils: FaucetUtils,
    launcherUtils: LauncherUtils
  ) {
    this.tokenUtils = tokenUtils;
    this.dexUtils = dexUtils;
    this.faucetUtils = faucetUtils;
    this.launcherUtils = launcherUtils;
  }

  async setupDex(signer: Signer): Promise<[DexAccounts, Atas]> {
    let tokenVault = await this.tokenUtils.initializeSplMint(
      signer,
      210_000_000 * 10 ** 9
    );

    const [faucetAuthority] = this.faucetUtils.pdaGetter.getAuthorityAddress();
    const [cpiAuthority] = this.launcherUtils.pdaGetter.getAuthorityAddress();

    await this.launcherUtils.initializeAuthorityManager(
      signer,
      faucetAuthority
    );
    await this.launcherUtils.initializeConfig(signer);
    await this.faucetUtils.initializeAuthorityManager(signer);
    await this.dexUtils.initializeAuthorityManager(signer, cpiAuthority);
    await this.dexUtils.initializeConfig(signer);

    let dex_mint = await this.launcherUtils.createMint(
      signer,
      "TEST",
      "TST",
      "https://www.google.com"
    );

    let payerVaultDex = {
      address: await this.tokenUtils.createAta(
        signer,
        signer.publicKey,
        dex_mint.address,
        false,
        dex_mint.program
      ),
      mint: dex_mint,
    };

    let launcherInitializeDexArgs = {
      dexUtils: this.dexUtils,
      faucetUtils: this.faucetUtils,
      payerVault: tokenVault,
      mintAuthority: dex_mint,
      hasFaucet: true,
    };
    let dexAccounts = await this.launcherUtils.initializeDex(
      signer,
      launcherInitializeDexArgs
    );

    let faucetAccounts = await this.faucetUtils.initializeFaucetClaim(
      signer,
      dex_mint
    );

    let shardAddress = this.faucetUtils.getShardAddress(
      faucetAccounts.faucetClaim,
      0
    );

    let faucetAmount = await this.tokenUtils.getBalance(
      faucetAccounts.faucetVault.address
    );

    let leafs = [...Array(1)].map(
      (_, index) =>
        new FaucetMerkleLeaf(
          shardAddress,
          signer.publicKey,
          new BN(index),
          faucetAmount
        )
    );
    let merkle_tree = new FaucetMerkleTree(leafs);
    let merkle_root = merkle_tree.tree.getRoot();

    let faucetClaimShardArgs = {
      faucetAccounts,
      merkle_root,
    };

    let faucetClaimShard = await this.faucetUtils.initializeFaucetClaimShard(
      signer,
      faucetClaimShardArgs
    );

    let leafProof = merkle_tree.getLeafProof(new BN(0));

    let claimArgs = {
      faucetAccounts,
      faucetClaimShard,
      payerVault: payerVaultDex,
      index: leafProof.index,
      path: leafProof.proof,
      amount: faucetAmount,
    };

    await this.faucetUtils.claim(signer, claimArgs);

    let atas = {
      vaultZero: tokenVault,
      vaultOne: payerVaultDex,
    };

    if (dexAccounts.vaultOne.mint.address != atas.vaultOne.mint.address) {
      atas = {
        vaultZero: atas.vaultOne,
        vaultOne: atas.vaultZero,
      };
    }

    return [dexAccounts, atas];
  }

  async swapBaseInputCalculator(
    dexAccounts: DexAccounts,
    amountIn: BN,
    minimumAmountOut: BN,
    zeroToOne: boolean
  ): Promise<SwapBaseResult> {
    let calculator = new SwapCalculator();
    let inputVault = zeroToOne ? dexAccounts.vaultZero : dexAccounts.vaultOne;
    let outputVault = zeroToOne ? dexAccounts.vaultOne : dexAccounts.vaultZero;

    let [
      dexState,
      configState,
      inputVaultBalance,
      outputVaultBalance,
      inputMintConfig,
      outputMintConfig,
      epoch,
    ] = await Promise.all([
      this.dexUtils.getDexState(dexAccounts.dex),
      this.dexUtils.getConfigState(dexAccounts.config),
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

    let inputProtocolFee = zeroToOne
      ? dexState.swapFeesToken0
      : dexState.swapFeesToken1;

    let outputProtocolFee = zeroToOne
      ? dexState.swapFeesToken1
      : dexState.swapFeesToken0;

    let result = calculator.swapBaseInput({
      swapFeeRate: configState.swapFeeRate,
      inputProtocolFee,
      outputProtocolFee,
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

  async getPairK(dexAccounts: DexAccounts) {
    let dexState = await this.dexUtils.getDexState(dexAccounts.dex);
    let vaultZeroBalance = await this.tokenUtils.getBalance(
      dexAccounts.vaultZero.address
    );
    let vaultOneBalance = await this.tokenUtils.getBalance(
      dexAccounts.vaultOne.address
    );

    vaultZeroBalance = vaultZeroBalance.sub(dexState.swapFeesToken0);
    vaultOneBalance = vaultOneBalance.sub(dexState.swapFeesToken1);

    if (vaultZeroBalance.gte(vaultOneBalance)) {
      return vaultZeroBalance.div(vaultOneBalance);
    }

    return vaultOneBalance.div(vaultZeroBalance);
  }

  async getSwapInputParams(
    atas: Atas,
    launch: boolean,
    zeroToOne: boolean
  ): Promise<[BN, BN]> {
    let vaultBalance = await this.getAtaBalance(atas, zeroToOne);
    let amountIn = new BN(1000);
    let minimumAmountOut = new BN(1);

    if (launch) {
      amountIn = vaultBalance;
    }

    return [amountIn, minimumAmountOut];
  }

  async getSwapOutputParams(
    atas: Atas,
    pairK: BN,
    launch: boolean,
    zeroToOne: boolean
  ): Promise<[BN, BN]> {
    let maxAmountIn = await this.getAtaBalance(atas, zeroToOne);
    let amountOutLessFee = new BN(10).mul(pairK);

    return [maxAmountIn, amountOutLessFee];
  }

  async getAtaBalance(atas: Atas, zeroToOne: boolean) {
    let vaultAddress = zeroToOne
      ? atas.vaultZero.address
      : atas.vaultOne.address;

    let vaultBalance = await this.tokenUtils.getBalance(vaultAddress);

    return vaultBalance;
  }

  async getDexBalance(dexAccounts: DexAccounts, zeroToOne: boolean) {
    let vaultAddress = zeroToOne
      ? dexAccounts.vaultZero.address
      : dexAccounts.vaultOne.address;

    let vaultBalance = await this.tokenUtils.getBalance(vaultAddress);

    return vaultBalance;
  }

  async getDexSwapFees(dexAccounts: DexAccounts, zeroToOne: boolean) {
    let dexState = await this.dexUtils.getDexState(dexAccounts.dex);
    let swapFees = zeroToOne
      ? dexState.swapFeesToken0
      : dexState.swapFeesToken1;
    return swapFees;
  }

  async getDexLaunchFees(dexAccounts: DexAccounts, zeroToOne: boolean) {
    let dexState = await this.dexUtils.getDexState(dexAccounts.dex);
    let swapFees = zeroToOne
      ? dexState.launchFeesToken0
      : dexState.launchFeesToken1;
    return swapFees;
  }

  async setupSwapBaseInput(
    signer: Signer,
    launch: boolean = false
  ): Promise<SetupInputSwap> {
    let [dexAccounts, atas] = await this.setupDex(signer);

    let vaultForReserveBound = (
      await this.dexUtils.getDexState(dexAccounts.dex)
    ).vaultForReserveBound;

    let zeroToOne = !vaultForReserveBound;

    let [amountIn, minimumAmountOut] = await this.getSwapInputParams(
      atas,
      launch,
      zeroToOne
    );

    let swapBaseInputArgs = zeroToOne
      ? {
          inputToken: dexAccounts.vaultZero.mint.address,
          inputTokenProgram: dexAccounts.vaultZero.mint.program,
          outputToken: dexAccounts.vaultOne.mint.address,
          outputTokenProgram: dexAccounts.vaultOne.mint.program,
          inputAta: atas.vaultZero.address,
          outputAta: atas.vaultOne.address,
          inputVault: dexAccounts.vaultZero.address,
          outputVault: dexAccounts.vaultOne.address,
          amountIn,
          minimumAmountOut,
          dexAccounts: dexAccounts,
        }
      : {
          inputToken: dexAccounts.vaultOne.mint.address,
          inputTokenProgram: dexAccounts.vaultOne.mint.program,
          outputToken: dexAccounts.vaultZero.mint.address,
          outputTokenProgram: dexAccounts.vaultZero.mint.program,
          inputAta: atas.vaultOne.address,
          outputAta: atas.vaultZero.address,
          inputVault: dexAccounts.vaultOne.address,
          outputVault: dexAccounts.vaultZero.address,
          amountIn,
          minimumAmountOut,
          dexAccounts: dexAccounts,
        };

    let swapInputExpected = await this.swapBaseInputCalculator(
      dexAccounts,
      amountIn,
      minimumAmountOut,
      zeroToOne
    );

    return {
      dexAccounts,
      swapBaseInputArgs,
      swapInputExpected,
      atas,
      vaultForReserveBound,
      zeroToOne,
    };
  }

  async swapOutputCalculator(
    dexAccounts: DexAccounts,
    maxAmountIn: BN,
    amountOutLessFee: BN,
    zeroToOne: boolean
  ): Promise<SwapBaseResult> {
    let calculator = new SwapCalculator();
    let inputVault = zeroToOne ? dexAccounts.vaultZero : dexAccounts.vaultOne;
    let outputVault = zeroToOne ? dexAccounts.vaultOne : dexAccounts.vaultZero;

    let [
      dexState,
      dexConfig,
      inputVaultBalance,
      outputVaultBalance,
      inputMintConfig,
      outputMintConfig,
      epoch,
    ] = await Promise.all([
      this.dexUtils.getDexState(dexAccounts.dex),
      this.dexUtils.getConfigState(dexAccounts.config),
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

    let inputProtocolFee = zeroToOne
      ? dexState.swapFeesToken0
      : dexState.swapFeesToken1;

    let outputProtocolFee = zeroToOne
      ? dexState.swapFeesToken1
      : dexState.swapFeesToken0;

    let result = calculator.swapBaseOutput({
      swapFeeRate: dexConfig.swapFeeRate,
      inputProtocolFee,
      outputProtocolFee,
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
    launch: boolean = false
  ): Promise<SetupOutputSwap> {
    let [dexAccounts, atas] = await this.setupDex(signer);

    let vaultForReserveBound = (
      await this.dexUtils.getDexState(dexAccounts.dex)
    ).vaultForReserveBound;

    let zeroToOne = !vaultForReserveBound;

    let pairK = await this.getPairK(dexAccounts);

    let [maxAmountIn, amountOutLessFee] = await this.getSwapOutputParams(
      atas,
      pairK,
      launch,
      zeroToOne
    );

    let swapBaseOutputArgs = zeroToOne
      ? {
          inputToken: dexAccounts.vaultZero.mint.address,
          inputTokenProgram: dexAccounts.vaultZero.mint.program,
          outputToken: dexAccounts.vaultOne.mint.address,
          outputTokenProgram: dexAccounts.vaultOne.mint.program,
          inputAta: atas.vaultZero.address,
          outputAta: atas.vaultOne.address,
          inputVault: dexAccounts.vaultZero.address,
          outputVault: dexAccounts.vaultOne.address,
          maxAmountIn,
          amountOutLessFee,
          dexAccounts,
        }
      : {
          inputToken: dexAccounts.vaultOne.mint.address,
          inputTokenProgram: dexAccounts.vaultOne.mint.program,
          outputToken: dexAccounts.vaultZero.mint.address,
          outputTokenProgram: dexAccounts.vaultZero.mint.program,
          inputAta: atas.vaultOne.address,
          outputAta: atas.vaultZero.address,
          inputVault: dexAccounts.vaultOne.address,
          outputVault: dexAccounts.vaultZero.address,
          maxAmountIn,
          amountOutLessFee,
          dexAccounts,
        };

    let swapOutputExpected = await this.swapOutputCalculator(
      dexAccounts,
      swapBaseOutputArgs.maxAmountIn,
      swapBaseOutputArgs.amountOutLessFee,
      zeroToOne
    );

    return {
      dexAccounts,
      swapBaseOutputArgs,
      swapOutputExpected,
      atas,
      vaultForReserveBound,
      zeroToOne,
    };
  }
}
