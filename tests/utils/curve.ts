import { BN } from "@coral-xyz/anchor";
import {
  calculateEpochFee,
  calculateFee,
  getEpochFee,
  MAX_FEE_BASIS_POINTS,
  ONE_IN_BASIS_POINTS,
  TOKEN_PROGRAM_ID,
  TransferFee,
  TransferFeeConfig,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

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

  checkedSub(a: BN, b: BN): BN {
    if (b.gt(a)) {
      throw Error("Sub Underflow");
    }
    return a.sub(b);
  }

  swapBaseInput(
    sourceAmount: BN,
    swapSourceAmount: BN,
    swapDestinationAmount: BN,
    protocolFeeRate: BN
  ): SwapResult {
    // debit the fee to calculate the amount swapped
    let protocolFee = this.Fee(sourceAmount, protocolFeeRate);
    let sourceAmountLessFees = this.checkedSub(sourceAmount, protocolFee);
    let destinationAmountSwapped = this.swapBaseInputWithoutFees(
      sourceAmountLessFees,
      swapSourceAmount,
      swapDestinationAmount
    );

    return {
      newSwapSourceAmount: swapSourceAmount.add(sourceAmount),
      newSwapDestinationAmount: this.checkedSub(
        swapDestinationAmount,
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

    let sourceAmount = this.calculatePreFeeAmount(
      sourceAmountSwapped,
      protocolFeeRate
    );
    let protocolFee = this.Fee(sourceAmount, protocolFeeRate);

    return {
      newSwapSourceAmount: swapSourceAmount.add(sourceAmount),
      newSwapDestinationAmount: this.checkedSub(
        swapDestinationAmount,
        destinationAmount
      ),
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
  ): BN {
    // (x + delta_x) * (y - delta_y) = x * y
    // delta_x = (x * delta_y) / (y - delta_y)
    let numerator = swapSourceAmount.mul(destinationAmount);
    let denominator = this.checkedSub(swapDestinationAmount, destinationAmount);
    let result = this.checkedCeilDiv(numerator, denominator);

    return result[0];
  }

  feeCeilDiv(tokenAmount: BN, feeNumerator: BN, feeDenominator: BN): BN {
    return tokenAmount
      .mul(feeNumerator)
      .add(feeDenominator)
      .sub(this.ONE)
      .div(feeDenominator);
  }

  ceilDiv(numerator: BN, denominator: BN): BN {
    const quotient = numerator.div(denominator);
    const remainder = numerator.mod(denominator);
    if (remainder.gt(this.ZERO)) {
      return quotient.add(this.ONE);
    }
    return quotient;
  }

  checkedCeilDiv(lhs: BN, rhs: BN): [BN, BN] {
    if (rhs.isZero()) {
      throw Error("Div by zero");
    }

    let quotient = lhs.div(rhs);

    // Avoid dividing a small number by a big one and returning 1, and instead fail.
    if (quotient.isZero()) {
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

  Fee(amount: BN, feeRate: BN): BN {
    return this.floorDiv(amount, feeRate, this.FEE_RATE_DENOMINATOR_VALUE);
  }

  calculatePreFeeAmount(postFeeAmount: BN, tradeFeeRate: BN): BN {
    if (tradeFeeRate.isZero()) {
      return postFeeAmount;
    }

    const numerator = postFeeAmount.mul(this.FEE_RATE_DENOMINATOR_VALUE);

    const denominator = this.checkedSub(
      this.FEE_RATE_DENOMINATOR_VALUE.clone(),
      tradeFeeRate
    );

    let result = numerator.add(denominator).sub(this.ONE).div(denominator);

    return result;
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

export interface SwapBaseResult {
  inputAmountFee: MintFeeCalculation;
  outputAmountFee: MintFeeCalculation;
  swapCalculation: SwapCalculation;
  swapResult: SwapResult;
}

export interface SwapBaseInputArgs {
  swapFeeRate: BN;
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

export interface SwapBaseOutputArgs {
  swapFeeRate: BN;
  inputProtocolFee: BN;
  outputProtocolFee: BN;
  inputMintConfig: TransferFeeConfig | null;
  outputMintConfig: TransferFeeConfig | null;
  inputVault: BN;
  outputVault: BN;
  maxAmountIn: BN;
  amountOutLessFee: BN;
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
    let totalInputTokenAmount = this.curve.checkedSub(
      inputVault,
      inputProtocolFee
    );
    let totalOutputTokenAmount = this.curve.checkedSub(
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

    let epochFee = new BN(
      calculateEpochFee(config, epoch, BigInt(amount.toNumber())).toString()
    );

    if (epochFee.gt(amount)) {
      throw Error("Sub overflow");
    }
    return {
      amount,
      actualAmount: amount.sub(epochFee),
      fee: epochFee,
    };
  }

  calculatePreFeeAmount(transferFee: TransferFee, postFeeAmount: BN) {
    if (transferFee.transferFeeBasisPoints == 0) {
      return postFeeAmount;
    } else if (
      BigInt(transferFee.transferFeeBasisPoints) == ONE_IN_BASIS_POINTS ||
      postFeeAmount.eq(this.curve.ZERO)
    ) {
      return this.curve.ZERO;
    } else {
      const numerator = BigInt(postFeeAmount.toNumber()) * ONE_IN_BASIS_POINTS;
      const denominator =
        ONE_IN_BASIS_POINTS - BigInt(transferFee.transferFeeBasisPoints);
      const rawPreFeeAmount = this.curve.ceilDiv(
        new BN(numerator.toString()),
        new BN(denominator.toString())
      );

      if (
        rawPreFeeAmount
          .sub(postFeeAmount)
          .gte(new BN(transferFee.maximumFee.toString()))
      ) {
        return postFeeAmount.add(new BN(transferFee.maximumFee.toString()));
      } else {
        return rawPreFeeAmount;
      }
    }
  }

  calculateTransferInverseFee(
    config: TransferFeeConfig | null,
    epoch: bigint,
    postFeeAmount: BN
  ) {
    if (config === null) {
      return {
        amount: postFeeAmount,
        actualAmount: postFeeAmount,
        fee: this.curve.ZERO,
      };
    }

    if (postFeeAmount.isZero()) {
      throw Error("Inverse fee amount is zero");
    }

    let transferFee = getEpochFee(config, epoch);

    if (transferFee.transferFeeBasisPoints == MAX_FEE_BASIS_POINTS) {
      let fee = new BN(transferFee.maximumFee.toString());
      return {
        amount: postFeeAmount,
        actualAmount: postFeeAmount.add(fee),
        fee,
      };
    } else {
      let preFeeAmount = this.calculatePreFeeAmount(transferFee, postFeeAmount);
      let fee = new BN(
        calculateFee(transferFee, BigInt(preFeeAmount.toNumber())).toString()
      );

      return {
        amount: postFeeAmount,
        actualAmount: postFeeAmount.add(fee),
        fee,
      };
    }
  }

  swapBaseInput(args: SwapBaseInputArgs): SwapBaseResult {
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
      args.swapFeeRate
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

  swapBaseOutput(args: SwapBaseOutputArgs): SwapBaseResult {
    let outputFeeCalculation = this.calculateTransferInverseFee(
      args.outputMintConfig,
      args.epoch,
      args.amountOutLessFee
    );

    let swapCalculation = this.calculateTradeAmountsAndPriceBeforeSwap(
      args.inputProtocolFee,
      args.outputProtocolFee,
      args.inputVault,
      args.outputVault
    );

    let result = this.curve.swapBaseOutput(
      outputFeeCalculation.actualAmount,
      swapCalculation.totalInputTokenAmount,
      swapCalculation.totalOutputTokenAmount,
      args.swapFeeRate
    );

    if (result.sourceAmountSwapped.isZero()) {
      throw Error("sourceAmountSwapped is zero");
    }

    let inputFeeCalculation = this.calculateTransferInverseFee(
      args.inputMintConfig,
      args.epoch,
      result.sourceAmountSwapped
    );

    if (inputFeeCalculation.actualAmount.gt(args.maxAmountIn)) {
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
