import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { CpProxy } from "../target/types/cp_proxy";
import { deposit, setupDepositTest, withdraw } from "./utils";

describe("withdraw test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const owner = anchor.Wallet.local().payer;
  const program = anchor.workspace.CpProxy as Program<CpProxy>;

  const confirmOptions = {
    skipPreflight: true,
  };

  it("withdraw half of lp ", async () => {
    const cpSwapPoolState = await setupDepositTest(
      program,
      anchor.getProvider().connection,
      owner,
      { transferFeeBasisPoints: 0, MaxFee: 0 }
    );
    const liquidity = new BN(10000000000);
    await deposit(
      program,
      owner,
      cpSwapPoolState.ammConfig,
      cpSwapPoolState.token0Mint,
      cpSwapPoolState.token0Program,
      cpSwapPoolState.token1Mint,
      cpSwapPoolState.token1Program,
      liquidity,
      new BN(10000000000),
      new BN(20000000000)
    );

    const withdrawTx = await withdraw(
      program,
      owner,
      cpSwapPoolState.ammConfig,
      cpSwapPoolState.token0Mint,
      cpSwapPoolState.token0Program,
      cpSwapPoolState.token1Mint,
      cpSwapPoolState.token1Program,
      liquidity.divn(2),
      new BN(10000000),
      new BN(1000000),
      confirmOptions
    );
    console.log("withdrawTx:", withdrawTx);
  });
});
