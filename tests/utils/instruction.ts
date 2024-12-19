import { Program, BN } from "@coral-xyz/anchor";
import { CpProxy } from "../../target/types/cp_proxy";
import { Dex } from "../../target/types/dex";
import {
  Connection,
  ConfirmOptions,
  PublicKey,
  Keypair,
  Signer,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount
} from "@solana/spl-token";
import {
  getAuthAddress,
  getPoolAddress,
  getPoolLpMintAddress,
  getPoolVaultAddress,
  createTokenMintAndAssociatedTokenAccount,
  getOrcleAccountAddress,
  getAmmConfigAddress,
  getPoolLpVaultAddress,
} from "./index";

import { cpSwapProgram, configAddress, createPoolFeeReceive } from "../config";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { CpmmPoolInfoLayout } from "@raydium-io/raydium-sdk-v2";
import { Test } from "mocha";


export async function setupInitializeTokens(
  connection: Connection,
  owner: Signer,
  transferFeeConfig: { transferFeeBasisPoints: number; MaxFee: number } = {
    transferFeeBasisPoints: 0,
    MaxFee: 0,
  },
  confirmOptions?: ConfirmOptions
) {
  const [{ token0, token0Program }, { token1, token1Program }] =
    await createTokenMintAndAssociatedTokenAccount(
      connection,
      owner,
      new Keypair(),
      transferFeeConfig
    );
  return {
    token0,
    token0Program,
    token1,
    token1Program,
  };
}

export async function setupInitializeTest(
  connection: Connection,
  owner: Signer,
  transferFeeConfig: { transferFeeBasisPoints: number; MaxFee: number } = {
    transferFeeBasisPoints: 0,
    MaxFee: 0,
  },
  confirmOptions?: ConfirmOptions
) {
  const [{ token0, token0Program }, { token1, token1Program }] =
    await createTokenMintAndAssociatedTokenAccount(
      connection,
      owner,
      new Keypair(),
      transferFeeConfig
    );
  return {
    configAddress,
    token0,
    token0Program,
    token1,
    token1Program,
  };
}

export async function setupDepositTest(
  program: Program<CpProxy>,
  connection: Connection,
  owner: Signer,
  transferFeeConfig: { transferFeeBasisPoints: number; MaxFee: number } = {
    transferFeeBasisPoints: 0,
    MaxFee: 0,
  },
  confirmOptions?: ConfirmOptions,
  initAmount: { initAmount0: BN; initAmount1: BN } = {
    initAmount0: new BN(10000000000),
    initAmount1: new BN(20000000000),
  },
  tokenProgramRequired?: {
    token0Program: PublicKey;
    token1Program: PublicKey;
  }
) {
  while (1) {
    const [{ token0, token0Program }, { token1, token1Program }] =
      await createTokenMintAndAssociatedTokenAccount(
        connection,
        owner,
        new Keypair(),
        transferFeeConfig
      );

    if (tokenProgramRequired != undefined) {
      if (
        token0Program.equals(tokenProgramRequired.token0Program) &&
        token1Program.equals(tokenProgramRequired.token1Program)
      ) {
        const { cpSwapPoolState } = await initialize(
          program,
          owner,
          configAddress,
          token0,
          token0Program,
          token1,
          token1Program,
          confirmOptions,
          initAmount
        );
        return cpSwapPoolState;
      }
    } else {
      const { cpSwapPoolState } = await initialize(
        program,
        owner,
        configAddress,
        token0,
        token0Program,
        token1,
        token1Program,
        confirmOptions,
        initAmount
      );
      return cpSwapPoolState;
    }
  }
}

export async function createDexAmmConfig(
  program: Program<Dex>,
  creator: Signer,
  params: {
    index: number,
    protocol_fee_rate: BN,
    launch_fee_rate: BN,
  },
) {
  let [amm] = await getAmmConfigAddress(params.index, program.programId);
  let signature = await program.methods.createAmmConfig(params.index,  params.protocol_fee_rate, params.launch_fee_rate).accounts({
    owner: creator.publicKey,
    ammConfig: amm,
  }).rpc();

  let state = await program.account.ammConfig.fetchNullable(amm);
  return {
    signature, amm, state
  }
}

export async function setupDex(
  dex_program: Program<Dex>,
  proxy_program: Program<CpProxy>,
  creator: Signer,
) {
    const confirmOptions = {
      skipPreflight: true,
    };

    const { configAddress, token0, token0Program, token1, token1Program } =
      await setupInitializeTest(
        dex_program.provider.connection,
        creator,
        { transferFeeBasisPoints: 0, MaxFee: 0 },
        confirmOptions
      );

    let raydium_deposit = {
      initAmount0: new BN(15000),
      initAmount1: new BN(72000),
    }

    const raydium = await initialize(
      proxy_program,
      creator,
      configAddress,
      token0,
      token0Program,
      token1,
      token1Program,
      confirmOptions,
      raydium_deposit
    );

    let amm = await createDexAmmConfig(
      dex_program,
      creator,
      {
        index: 1,
        protocol_fee_rate: new BN(30_000),
        launch_fee_rate: new BN(30_000),
      }
    );

    let dex_deposit = {
      initAmount0: new BN(1000),
      initAmount1: new BN(2000),
    }

    let dex = await initializeDex(
      dex_program,
      creator,
      amm.amm,
      token0,
      token0Program,
      token1,
      token1Program,
      {
        pool: raydium.poolAddress,
        lpMint: raydium.lpMint,
      },
      confirmOptions,
      dex_deposit
    );

    return {
      dex,
      raydium,
    }
}


/* export async function launch(
  signer: Signer,
  dex: {
    program: Program<Dex>,
    vault0: PublicKey,
    vault1: PublicKey,
    lp_vault: PublicKey,
    authority: PublicKey,
    state: PublicKey,
    amm: PublicKey,
  },
  raydium: {
    program: PublicKey,
    vault0: PublicKey,
    vault1: PublicKey,
    mint0: PublicKey,
    mint1: PublicKey,
    lp_mint: PublicKey,
    authority: PublicKey,
    state: PublicKey,
    amm: PublicKey,
  },
  confirmOptions?: ConfirmOptions
) {
  
  const tx = await dex.program.methods
    .launch()
    .accounts({
      owner: signer.publicKey,
      // dex
      authority: dex.authority,
      poolState: dex.state,
      token0Vault: dex.vault0,
      token1Vault: dex.vault1,
      authorityLpToken: dex.lp_vault,
      // raydium
      raydiumProgram: raydium.program,
      raydiumPoolState: raydium.state,
      raydiumAuthority: raydium.authority,
      raydiumToken0Vault: raydium.vault0,
      raydiumToken1Vault: raydium.vault1,
      raydiumToken0Mint: raydium.mint0,
      raydiumToken1Mint: raydium.mint1,
      raydiumLpMint: raydium.lp_mint,
      // system programs
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ])
    .rpc(confirmOptions);

  return { tx };
} */

export async function setupSwapTest(
  program: Program<CpProxy>,
  connection: Connection,
  owner: Signer,
  transferFeeConfig: { transferFeeBasisPoints: number; MaxFee: number } = {
    transferFeeBasisPoints: 0,
    MaxFee: 0,
  },
  confirmOptions?: ConfirmOptions
) {
  const [{ token0, token0Program }, { token1, token1Program }] =
    await createTokenMintAndAssociatedTokenAccount(
      connection,
      owner,
      new Keypair(),
      transferFeeConfig
    );

  const { cpSwapPoolState } = await initialize(
    program,
    owner,
    configAddress,
    token0,
    token0Program,
    token1,
    token1Program,
    confirmOptions
  );

  await deposit(
    program,
    owner,
    configAddress,
    token0,
    token0Program,
    token1,
    token1Program,
    new BN(10000000000),
    new BN(100000000000),
    new BN(100000000000),
    confirmOptions
  );
  return cpSwapPoolState;
}

export async function initializeDex(
  program: Program<Dex>,
  creator: Signer,
  amm: PublicKey,
  token0: PublicKey,
  token0Program: PublicKey,
  token1: PublicKey,
  token1Program: PublicKey,
  raydium: {
    pool: PublicKey,
    lpMint: PublicKey,
  },
  confirmOptions?: ConfirmOptions,
  initAmount: { initAmount0: BN; initAmount1: BN } = {
    initAmount0: new BN(100000000000000),
    initAmount1: new BN(200000000000000),
  },
  createPoolFee = createPoolFeeReceive
) {
  const [auth] = await getAuthAddress(program.programId);
  const [poolStateAddress] = await getPoolAddress(
    amm,
    token0,
    token1,
    program.programId
  );
  const [lpVault0] = await getPoolLpVaultAddress(
    poolStateAddress,
    raydium.lpMint,
    program.programId
  );
  const [vault0] = await getPoolVaultAddress(
    poolStateAddress,
    token0,
    program.programId
  );
  const [vault1] = await getPoolVaultAddress(
    poolStateAddress,
    token1,
    program.programId
  );

  const creatorToken0 = getAssociatedTokenAddressSync(
    token0,
    creator.publicKey,
    false,
    token0Program
  );
  const creatorToken1 = getAssociatedTokenAddressSync(
    token1,
    creator.publicKey,
    false,
    token1Program
  );
  
  const tx = await program.methods
    .initialize(initAmount.initAmount0, initAmount.initAmount1, new BN(0), new BN(initAmount.initAmount0.toNumber() * 1.2))
    .accounts({
      tokenLpMint: raydium.lpMint,
      raydium: raydium.pool, 
      creator: creator.publicKey,
      ammConfig: amm,
      authority: auth,
      poolState: poolStateAddress,
      token0Mint: token0,
      token1Mint: token1,
      creatorToken0,
      creatorToken1,
      token0Vault: vault0,
      token1Vault: vault1,
      tokenLpVault: lpVault0,
      tokenProgram: TOKEN_PROGRAM_ID,
      token0Program: token0Program,
      token1Program: token1Program,
      associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ])
    .rpc(confirmOptions);

  let poolState = await program.account.poolState.fetchNullable(poolStateAddress);
  const state = {
    get_pool_state: async () => {
      return await program.account.poolState.fetchNullable(poolStateAddress);
    },
    state: poolState,
    authority: auth,
  };
  return { poolStateAddress, state, tx };
}

export async function initialize(
  program: Program<CpProxy>,
  creator: Signer,
  configAddress: PublicKey,
  token0: PublicKey,
  token0Program: PublicKey,
  token1: PublicKey,
  token1Program: PublicKey,
  confirmOptions?: ConfirmOptions,
  initAmount: { initAmount0: BN; initAmount1: BN } = {
    initAmount0: new BN(100000000000000),
    initAmount1: new BN(200000000000000),
  },
  createPoolFee = createPoolFeeReceive
) {
  const [auth] = await getAuthAddress(cpSwapProgram);
  const [poolAddress] = await getPoolAddress(
    configAddress,
    token0,
    token1,
    cpSwapProgram
  );
  const [lpMintAddress] = await getPoolLpMintAddress(
    poolAddress,
    cpSwapProgram
  );
  const [vault0] = await getPoolVaultAddress(
    poolAddress,
    token0,
    cpSwapProgram
  );
  const [vault1] = await getPoolVaultAddress(
    poolAddress,
    token1,
    cpSwapProgram
  );
  const [creatorLpTokenAddress] = await PublicKey.findProgramAddress(
    [
      creator.publicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      lpMintAddress.toBuffer(),
    ],
    ASSOCIATED_PROGRAM_ID
  );

  const [observationAddress] = await getOrcleAccountAddress(
    poolAddress,
    cpSwapProgram
  );

  const creatorToken0 = getAssociatedTokenAddressSync(
    token0,
    creator.publicKey,
    false,
    token0Program
  );
  const creatorToken1 = getAssociatedTokenAddressSync(
    token1,
    creator.publicKey,
    false,
    token1Program
  );
  const tx = await program.methods
    .proxyInitialize(initAmount.initAmount0, initAmount.initAmount1, new BN(0))
    .accounts({
      cpSwapProgram: cpSwapProgram,
      creator: creator.publicKey,
      ammConfig: configAddress,
      authority: auth,
      poolState: poolAddress,
      token0Mint: token0,
      token1Mint: token1,
      lpMint: lpMintAddress,
      creatorToken0,
      creatorToken1,
      creatorLpToken: creatorLpTokenAddress,
      token0Vault: vault0,
      token1Vault: vault1,
      createPoolFee,
      observationState: observationAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
      token0Program: token0Program,
      token1Program: token1Program,
      associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ])
    .rpc(confirmOptions);
  const accountInfo = await program.provider.connection.getAccountInfo(poolAddress);
  const poolState = CpmmPoolInfoLayout.decode(accountInfo.data);
  const cpSwapPoolState = {
    get_pool_state: async () => {
      const accountInfo = await program.provider.connection.getAccountInfo(
        poolAddress
      );
      const poolState = CpmmPoolInfoLayout.decode(accountInfo.data);
      return poolState;
    },
    ammConfig: poolState.configId,
    token0Mint: poolState.mintA,
    token0Program: poolState.mintProgramA,
    token1Mint: poolState.mintB,
    token1Program: poolState.mintProgramB,
  };

  return {tx, poolAddress, cpSwapPoolState, vault0, vault1, lpMint: lpMintAddress, authority: auth, };
}

export async function deposit(
  program: Program<CpProxy>,
  owner: Signer,
  configAddress: PublicKey,
  token0: PublicKey,
  token0Program: PublicKey,
  token1: PublicKey,
  token1Program: PublicKey,
  lp_token_amount: BN,
  maximum_token_0_amount: BN,
  maximum_token_1_amount: BN,
  confirmOptions?: ConfirmOptions
) {
  const [auth] = await getAuthAddress(cpSwapProgram);
  const [poolAddress] = await getPoolAddress(
    configAddress,
    token0,
    token1,
    cpSwapProgram
  );
  const [lpMintAddress] = await getPoolLpMintAddress(
    poolAddress,
    cpSwapProgram
  );
  const [vault0] = await getPoolVaultAddress(
    poolAddress,
    token0,
    cpSwapProgram
  );
  const [vault1] = await getPoolVaultAddress(
    poolAddress,
    token1,
    cpSwapProgram
  );
  const [ownerLpToken] = await PublicKey.findProgramAddress(
    [
      owner.publicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      lpMintAddress.toBuffer(),
    ],
    ASSOCIATED_PROGRAM_ID
  );

  const onwerToken0 = getAssociatedTokenAddressSync(
    token0,
    owner.publicKey,
    false,
    token0Program
  );
  const onwerToken1 = getAssociatedTokenAddressSync(
    token1,
    owner.publicKey,
    false,
    token1Program
  );

  const tx = await program.methods
    .proxyDeposit(
      lp_token_amount,
      maximum_token_0_amount,
      maximum_token_1_amount
    )
    .accounts({
      cpSwapProgram: cpSwapProgram,
      owner: owner.publicKey,
      authority: auth,
      poolState: poolAddress,
      ownerLpToken,
      token0Account: onwerToken0,
      token1Account: onwerToken1,
      token0Vault: vault0,
      token1Vault: vault1,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      vault0Mint: token0,
      vault1Mint: token1,
      lpMint: lpMintAddress,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ])
    .rpc(confirmOptions);
  return  {
    tx,
    ownerLpToken,
    lpMintAddress,
  };
}

export async function withdraw(
  program: Program<CpProxy>,
  owner: Signer,
  configAddress: PublicKey,
  token0: PublicKey,
  token0Program: PublicKey,
  token1: PublicKey,
  token1Program: PublicKey,
  lp_token_amount: BN,
  minimum_token_0_amount: BN,
  minimum_token_1_amount: BN,
  confirmOptions?: ConfirmOptions
) {
  const [auth] = await getAuthAddress(cpSwapProgram);
  const [poolAddress] = await getPoolAddress(
    configAddress,
    token0,
    token1,
    cpSwapProgram
  );

  const [lpMintAddress] = await getPoolLpMintAddress(
    poolAddress,
    cpSwapProgram
  );
  const [vault0] = await getPoolVaultAddress(
    poolAddress,
    token0,
    cpSwapProgram
  );
  const [vault1] = await getPoolVaultAddress(
    poolAddress,
    token1,
    cpSwapProgram
  );
  const [ownerLpToken] = await PublicKey.findProgramAddress(
    [
      owner.publicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      lpMintAddress.toBuffer(),
    ],
    ASSOCIATED_PROGRAM_ID
  );

  const onwerToken0 = getAssociatedTokenAddressSync(
    token0,
    owner.publicKey,
    false,
    token0Program
  );
  const onwerToken1 = getAssociatedTokenAddressSync(
    token1,
    owner.publicKey,
    false,
    token1Program
  );

  const tx = await program.methods
    .proxyWithdraw(
      lp_token_amount,
      minimum_token_0_amount,
      minimum_token_1_amount
    )
    .accounts({
      cpSwapProgram: cpSwapProgram,
      owner: owner.publicKey,
      authority: auth,
      poolState: poolAddress,
      ownerLpToken,
      token0Account: onwerToken0,
      token1Account: onwerToken1,
      token0Vault: vault0,
      token1Vault: vault1,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      vault0Mint: token0,
      vault1Mint: token1,
      lpMint: lpMintAddress,
      memoProgram: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ])
    .rpc(confirmOptions)
    .catch();

  return tx;
}

export async function dex_swap_base_input(
  program: Program<Dex>,
  owner: Signer,
  amm: PublicKey,
  inputToken: PublicKey,
  inputTokenProgram: PublicKey,
  outputToken: PublicKey,
  outputTokenProgram: PublicKey,
  amount_in: BN,
  minimum_amount_out: BN,
  raydium_pool: PublicKey,
  raydium_vault0: PublicKey,
  raydium_vault1: PublicKey,
  confirmOptions?: ConfirmOptions
) {
  const [auth] = await getAuthAddress(program.programId);
  const [poolAddress] = await getPoolAddress(
    amm,
    inputToken,
    outputToken,
    program.programId
  );

  const [inputVault] = await getPoolVaultAddress(
    poolAddress,
    inputToken,
    program.programId
  );
  const [outputVault] = await getPoolVaultAddress(
    poolAddress,
    outputToken,
    program.programId
  );

  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputToken,
    owner.publicKey,
    false,
    inputTokenProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputToken,
    owner.publicKey,
    false,
    outputTokenProgram
  );


  const tx = await program.methods.swapBaseInput(amount_in, minimum_amount_out)
    .accounts({
      payer: owner.publicKey,
      authority: auth,
      ammConfig: amm,
      poolState: poolAddress,
      inputTokenAccount,
      outputTokenAccount,
      inputVault,
      outputVault,
      inputTokenProgram: inputTokenProgram,
      outputTokenProgram: outputTokenProgram,
      inputTokenMint: inputToken,
      outputTokenMint: outputToken,
      raydiumPoolState: raydium_pool,
      raydiumToken0Vault: raydium_vault0,
      raydiumToken1Vault: raydium_vault1,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ])
    .rpc(confirmOptions);

  return tx;
}

export async function dex_swap_base_output(
  program: Program<Dex>,
  owner: Signer,
  amm: PublicKey,
  inputToken: PublicKey,
  inputTokenProgram: PublicKey,
  outputToken: PublicKey,
  outputTokenProgram: PublicKey,
  amount_out_less_fee: BN,
  max_amount_in: BN,
  raydium_pool: PublicKey,
  raydium_vault0: PublicKey,
  raydium_vault1: PublicKey,
  confirmOptions?: ConfirmOptions
) {
  const [auth] = await getAuthAddress( program.programId);
  const [poolAddress] = await getPoolAddress(
    amm,
    inputToken,
    outputToken,
    program.programId
  );

  const [inputVault] = await getPoolVaultAddress(
    poolAddress,
    inputToken,
     program.programId
  );
  const [outputVault] = await getPoolVaultAddress(
    poolAddress,
    outputToken,
    program.programId
  );

  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputToken,
    owner.publicKey,
    false,
    inputTokenProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputToken,
    owner.publicKey,
    false,
    outputTokenProgram
  );


  const tx = await program.methods
    .swapBaseOutput(max_amount_in, amount_out_less_fee)
    .accounts({
      payer: owner.publicKey,
      authority: auth,
      ammConfig: amm,
      poolState: poolAddress,
      inputTokenAccount,
      outputTokenAccount,
      inputVault,
      outputVault,
      inputTokenProgram: inputTokenProgram,
      outputTokenProgram: outputTokenProgram,
      inputTokenMint: inputToken,
      outputTokenMint: outputToken,
      raydiumPoolState: raydium_pool,
      raydiumToken0Vault: raydium_vault0,
      raydiumToken1Vault: raydium_vault1,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ])
    .rpc(confirmOptions);

  return tx;
}

export async function swap_base_input(
  program: Program<CpProxy>,
  owner: Signer,
  configAddress: PublicKey,
  inputToken: PublicKey,
  inputTokenProgram: PublicKey,
  outputToken: PublicKey,
  outputTokenProgram: PublicKey,
  amount_in: BN,
  minimum_amount_out: BN,
  confirmOptions?: ConfirmOptions
) {
  const [auth] = await getAuthAddress(cpSwapProgram);
  const [poolAddress] = await getPoolAddress(
    configAddress,
    inputToken,
    outputToken,
    cpSwapProgram
  );

  const [inputVault] = await getPoolVaultAddress(
    poolAddress,
    inputToken,
    cpSwapProgram
  );
  const [outputVault] = await getPoolVaultAddress(
    poolAddress,
    outputToken,
    cpSwapProgram
  );

  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputToken,
    owner.publicKey,
    false,
    inputTokenProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputToken,
    owner.publicKey,
    false,
    outputTokenProgram
  );
  const [observationAddress] = await getOrcleAccountAddress(
    poolAddress,
    cpSwapProgram
  );

  const tx = await program.methods
    .proxySwapBaseInput(amount_in, minimum_amount_out)
    .accounts({
      cpSwapProgram: cpSwapProgram,
      payer: owner.publicKey,
      authority: auth,
      ammConfig: configAddress,
      poolState: poolAddress,
      inputTokenAccount,
      outputTokenAccount,
      inputVault,
      outputVault,
      inputTokenProgram: inputTokenProgram,
      outputTokenProgram: outputTokenProgram,
      inputTokenMint: inputToken,
      outputTokenMint: outputToken,
      observationState: observationAddress,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ])
    .rpc(confirmOptions);

  return tx;
}

export async function swap_base_output(
  program: Program<CpProxy>,
  owner: Signer,
  configAddress: PublicKey,
  inputToken: PublicKey,
  inputTokenProgram: PublicKey,
  outputToken: PublicKey,
  outputTokenProgram: PublicKey,
  amount_out_less_fee: BN,
  max_amount_in: BN,
  confirmOptions?: ConfirmOptions
) {
  const [auth] = await getAuthAddress(cpSwapProgram);
  const [poolAddress] = await getPoolAddress(
    configAddress,
    inputToken,
    outputToken,
    cpSwapProgram
  );

  const [inputVault] = await getPoolVaultAddress(
    poolAddress,
    inputToken,
    cpSwapProgram
  );
  const [outputVault] = await getPoolVaultAddress(
    poolAddress,
    outputToken,
    cpSwapProgram
  );

  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputToken,
    owner.publicKey,
    false,
    inputTokenProgram
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputToken,
    owner.publicKey,
    false,
    outputTokenProgram
  );
  const [observationAddress] = await getOrcleAccountAddress(
    poolAddress,
    cpSwapProgram
  );

  const tx = await program.methods
    .proxySwapBaseOutput(max_amount_in, amount_out_less_fee)
    .accounts({
      cpSwapProgram: cpSwapProgram,
      payer: owner.publicKey,
      authority: auth,
      ammConfig: configAddress,
      poolState: poolAddress,
      inputTokenAccount,
      outputTokenAccount,
      inputVault,
      outputVault,
      inputTokenProgram: inputTokenProgram,
      outputTokenProgram: outputTokenProgram,
      inputTokenMint: inputToken,
      outputTokenMint: outputToken,
      observationState: observationAddress,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ])
    .rpc(confirmOptions);

  return tx;
}