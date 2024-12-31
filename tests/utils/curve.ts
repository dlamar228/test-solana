import { BN } from "@coral-xyz/anchor";
import {
  calculateEpochFee,
  MAX_FEE_BASIS_POINTS,
  TOKEN_PROGRAM_ID,
  TransferFeeConfig,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { TokenUtils } from "./token.utils";

export interface SwapResult {
  newSwapSourceAmount: BN;
  newSwapDestinationAmount: BN;
  sourceAmountSwapped: BN;
  destinationAmountSwapped: BN;
  protocolFee: BN;
}

export class Curve {
  FEE_RATE_DENOMINATOR_VALUE = new BN(1_000_000);
  ZERO = new BN(0);
  ONE = new BN(1);
  TWO = new BN(2);

  validateSupply(amount0: BN, amount1: BN) {
    if (amount0.eq(this.ZERO) || amount1.eq(this.ZERO)) {
      throw Error("EmptySupply");
    }
  }

  swapBaseInput(
    sourceAmount: BN,
    swapSourceAmount: BN,
    swapDestinationAmount: BN,
    protocolFeeRate: BN
  ): SwapResult {
    // debit the fee to calculate the amount swapped
    let protocolFee = this.protocolFee(sourceAmount, protocolFeeRate);
    let sourceAmountLessFees = sourceAmount.sub(protocolFee);
    let destinationAmountSwapped = this.swapBaseInputWithoutFees(
      sourceAmountLessFees,
      swapSourceAmount,
      swapDestinationAmount
    );

    return {
      newSwapSourceAmount: swapSourceAmount.add(sourceAmount),
      newSwapDestinationAmount: swapDestinationAmount.sub(
        destinationAmountSwapped
      ),
      sourceAmountSwapped: sourceAmount,
      destinationAmountSwapped,
      protocolFee,
    };
  }

  swapBaseOutput(
    destinationAmount: BN,
    swapSourceAmount: BN,
    swapDestinationAmount: BN,
    protocolFeeRate: BN
  ): SwapResult {
    let sourceAmountSwapped = this.swapBaseOutputWithoutFees(
      destinationAmount,
      swapSourceAmount,
      swapDestinationAmount
    );

    if (!BN.isBN(sourceAmountSwapped)) {
      throw Error("sourceAmountSwapped is null");
    }

    let sourceAmount = this.calculatePreFeeAmount(
      sourceAmountSwapped,
      protocolFeeRate
    );
    let protocolFee = this.protocolFee(sourceAmount, protocolFeeRate);

    return {
      newSwapSourceAmount: swapSourceAmount.add(sourceAmount),
      newSwapDestinationAmount: swapDestinationAmount.sub(destinationAmount),
      sourceAmountSwapped: sourceAmount,
      destinationAmountSwapped: destinationAmount,
      protocolFee,
    };
  }

  swapBaseInputWithoutFees(
    sourceAmount: BN,
    swapSourceAmount: BN,
    swapDestinationAmount: BN
  ) {
    // (x + delta_x) * (y - delta_y) = x * y
    // delta_y = (delta_x * y) / (x + delta_x)
    let numerator = sourceAmount.mul(swapDestinationAmount);
    let denominator = swapSourceAmount.add(sourceAmount);
    return numerator.div(denominator);
  }

  swapBaseOutputWithoutFees(
    destinationAmount: BN,
    swapSourceAmount: BN,
    swapDestinationAmount: BN
  ): BN | null {
    // (x + delta_x) * (y - delta_y) = x * y
    // delta_x = (x * delta_y) / (y - delta_y)
    let numerator = swapSourceAmount.mul(destinationAmount);
    let denominator = swapDestinationAmount.sub(swapDestinationAmount);
    let result = this.checkedCeilDiv(numerator, denominator);

    if (Array.isArray(result)) {
      return result[0];
    }

    return null;
  }

  ceilDiv(tokenAmount: BN, feeNumerator: BN, feeDenominator: BN): BN {
    return tokenAmount
      .mul(feeNumerator)
      .add(feeDenominator)
      .sub(this.ONE)
      .div(feeDenominator);
  }

  checkedCeilDiv(lhs: BN, rhs: BN): [BN, BN] | null {
    if (rhs.eq(this.ZERO)) {
      return null; // Division by zero
    }

    let quotient = lhs.div(rhs);

    // Avoid dividing a small number by a big one and returning 1, and instead fail.
    if (quotient.eq(this.ZERO)) {
      if (lhs.mul(this.TWO).gte(rhs)) {
        return [this.ONE, this.ZERO];
      } else {
        return [this.ZERO, this.ZERO];
      }
    }

    const remainder = lhs.mod(rhs);
    if (remainder.gt(this.ZERO)) {
      quotient = quotient.add(this.ONE);
      // Calculate the minimum amount needed to get the dividend amount to avoid truncating too much.
      rhs = lhs.div(quotient);
      const newRemainder = lhs.mod(quotient);
      if (newRemainder.gt(this.ZERO)) {
        rhs = rhs.add(this.ONE);
      }
    }
    return [quotient, rhs];
  }

  floorDiv(tokenAmount: BN, feeNumerator: BN, feeDenominator: BN): BN {
    return tokenAmount.mul(feeNumerator).div(feeDenominator);
  }

  protocolFee(amount: BN, protocolFeeRate: BN): BN {
    return this.floorDiv(
      amount,
      protocolFeeRate,
      this.FEE_RATE_DENOMINATOR_VALUE
    );
  }

  calculatePreFeeAmount(postFeeAmount: BN, tradeFeeRate: BN): BN | null {
    if (tradeFeeRate.isZero()) {
      return postFeeAmount;
    }

    const numerator = postFeeAmount.mul(this.FEE_RATE_DENOMINATOR_VALUE);

    const denominator =
      this.FEE_RATE_DENOMINATOR_VALUE.clone().sub(tradeFeeRate);
    if (denominator.isZero()) {
      return null; // Avoid division by zero
    }

    let result = numerator.add(denominator).sub(this.ONE).div(denominator);

    return result; // Return the calculated pre-fee amount
  }

  getTransferFeeAmount(
    transferFeeConfig: { transferFeeBasisPoints: number; MaxFee: number },
    preFeeAmount: BN,
    tokenProgram: PublicKey
  ): BN {
    if (tokenProgram.equals(TOKEN_PROGRAM_ID)) {
      return this.ZERO;
    }
    if (preFeeAmount.eq(this.ZERO)) {
      return this.ZERO;
    } else {
      const numerator = preFeeAmount.mul(
        new BN(transferFeeConfig.transferFeeBasisPoints)
      );
      const rawFee = numerator
        .add(new BN(MAX_FEE_BASIS_POINTS))
        .sub(new BN(1))
        .div(new BN(MAX_FEE_BASIS_POINTS));
      const fee = rawFee.gt(new BN(transferFeeConfig.MaxFee))
        ? new BN(transferFeeConfig.MaxFee)
        : rawFee;
      return fee;
    }
  }
}

export function calculatePreFeeAmountToken(
  transferFeeConfig: { transferFeeBasisPoints: number; MaxFee: number },
  postFeeAmount: bigint,
  tokenProgram: PublicKey
) {
  if (
    transferFeeConfig.transferFeeBasisPoints == 0 ||
    tokenProgram.equals(TOKEN_PROGRAM_ID)
  ) {
    return postFeeAmount;
  } else {
    let numerator = postFeeAmount * BigInt(MAX_FEE_BASIS_POINTS);
    let denominator =
      MAX_FEE_BASIS_POINTS - transferFeeConfig.transferFeeBasisPoints;

    return (numerator + BigInt(denominator) - BigInt(1)) / BigInt(denominator);
  }
}

export interface SwapCalculation {
  totalInputTokenAmount: BN;
  totalOutputTokenAmount: BN;
  tokenInputPriceX64: BN;
  tokenOutputPriceX64: BN;
}

export interface MintFeeCalculation {
  amount: BN;
  actualAmount: BN;
  fee: BN;
}

export interface SwapBaseInputResult {
  inputAmountFee: MintFeeCalculation;
  outputAmountFee: MintFeeCalculation;
  swapCalculation: SwapCalculation;
  swapResult: SwapResult;
}

export interface SwapBaseInputArgs {
  protocolFeeRate: BN;
  inputProtocolFee: BN;
  outputProtocolFee: BN;
  inputMintConfig: TransferFeeConfig | null;
  outputMintConfig: TransferFeeConfig | null;
  inputVault: BN;
  outputVault: BN;
  amountIn: BN;
  minimumAmountOut: BN;
  epoch: bigint;
}

export class SwapCalculator {
  curve = new Curve();
  Q32 = new BN(4294967296);

  calculateTradeAmountsAndPriceBeforeSwap(
    inputProtocolFee: BN,
    outputProtocolFee: BN,
    inputVault: BN,
    outputVault: BN
  ): SwapCalculation {
    let totalInputTokenAmount = this.withoutFee(inputVault, inputProtocolFee);
    let totalOutputTokenAmount = this.withoutFee(
      outputVault,
      outputProtocolFee
    );
    let tokenInputPriceX64 = this.tokenPriceX32(totalInputTokenAmount);
    let tokenOutputPriceX64 = this.tokenPriceX32(totalOutputTokenAmount);

    return {
      totalInputTokenAmount,
      totalOutputTokenAmount,
      tokenInputPriceX64,
      tokenOutputPriceX64,
    };
  }

  tokenPriceX32(amount: BN) {
    if (amount.isZero()) {
      throw Error("Div by zero");
    }
    return amount.mul(this.Q32).div(amount);
  }

  withoutFee(amount: BN, fee: BN): BN {
    if (fee.gt(amount)) {
      throw Error("Sub overflow");
    }

    return amount.sub(fee);
  }

  calculateTransferFee(
    config: TransferFeeConfig | null,
    epoch: bigint,
    amount: BN
  ): MintFeeCalculation {
    if (config === null) {
      return {
        amount,
        actualAmount: amount,
        fee: this.curve.ZERO,
      };
    }

    let transferFee = new BN(
      calculateEpochFee(config, epoch, BigInt(amount.toNumber())).toString()
    );

    if (transferFee.gt(amount)) {
      throw Error("Sub overflow");
    }
    return {
      amount,
      actualAmount: amount.sub(transferFee),
      fee: transferFee,
    };
  }

  swapBaseInput(args: SwapBaseInputArgs): SwapBaseInputResult {
    let inputFeeCalculation = this.calculateTransferFee(
      args.inputMintConfig,
      args.epoch,
      args.amountIn
    );

    let swapCalculation = this.calculateTradeAmountsAndPriceBeforeSwap(
      args.inputProtocolFee,
      args.outputProtocolFee,
      args.inputVault,
      args.outputVault
    );

    let result = this.curve.swapBaseInput(
      inputFeeCalculation.actualAmount,
      swapCalculation.totalInputTokenAmount,
      swapCalculation.totalOutputTokenAmount,
      args.protocolFeeRate
    );

    if (!inputFeeCalculation.actualAmount.eq(result.sourceAmountSwapped)) {
      throw Error("actualAmount not eq sourceAmountSwapped");
    }

    let outputFeeCalculation = this.calculateTransferFee(
      args.outputMintConfig,
      args.epoch,
      result.sourceAmountSwapped
    );

    if (outputFeeCalculation.actualAmount.isZero()) {
      throw Error("Received zero");
    }

    if (args.minimumAmountOut.gt(outputFeeCalculation.actualAmount)) {
      throw Error("ExceededSlippage");
    }

    return {
      inputAmountFee: inputFeeCalculation,
      outputAmountFee: outputFeeCalculation,
      swapCalculation: swapCalculation,
      swapResult: result,
    };
  }
}
