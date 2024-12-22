import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  CpRaydium,
  IDL,
  cpSwapProgram,
  createPoolFeeReceive,
} from "./raydium.idl";
import {
  PublicKey,
  Signer,
  SystemProgram,
  ConfirmOptions,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { Mint, TokenVault } from "./token.utils";
import { u16ToBytes } from "./utils";

export interface PoolCreationArgs {
  amm: PublicKey;
  initAmount0: BN;
  initAmount1: BN;
  openTime: BN;
  mint0: Mint;
  mint1: Mint;
  signerAta0: PublicKey;
  signerAta1: PublicKey;
}

export class RaydiumUtils {
  program: Program<CpRaydium>;
  pdaGetter: RaydiumPda;
  confirmOptions: ConfirmOptions;

  constructor(program: Program<CpRaydium>, confirmOptions: ConfirmOptions) {
    this.program = program;
    this.confirmOptions = confirmOptions;
    this.pdaGetter = new RaydiumPda(program.programId);
  }

  async initializePool(
    signer: Signer,
    args: PoolCreationArgs
  ): Promise<RaydiumAccounts> {
    let [auth] = this.pdaGetter.getAuthAddress();
    let [state] = this.pdaGetter.getStateAddress(
      args.amm,
      args.mint0.address,
      args.mint1.address
    );
    let [vault0] = this.pdaGetter.getVaultAddress(state, args.mint0.address);
    let [vault1] = this.pdaGetter.getVaultAddress(state, args.mint1.address);
    let [oracle] = this.pdaGetter.getOracleAddress(state);
    let [lpMint] = this.pdaGetter.getLpMintAddress(state);
    let [creatorLpToken] = PublicKey.findProgramAddressSync(
      [
        signer.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        lpMint.toBuffer(),
      ],
      ASSOCIATED_PROGRAM_ID
    );

    await this.program.methods
      .initialize(args.initAmount0, args.initAmount1, args.openTime)
      .accounts({
        creator: signer.publicKey,
        ammConfig: args.amm,
        authority: auth,
        poolState: state,
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
        observationState: oracle,
        lpMint,
        createPoolFee: createPoolFeeReceive,
        creatorLpToken,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    return {
      auth,
      amm: args.amm,
      state,
      vault0: {
        mint: args.mint0,
        address: vault0,
      },
      vault1: {
        mint: args.mint1,
        address: vault1,
      },
      lpMint: {
        authority: state,
        freezeAuthority: state,
        decimals: 9,
        address: lpMint,
        program: TOKEN_PROGRAM_ID,
      },
    };
  }
}

export interface RaydiumAccounts {
  auth: PublicKey;
  amm: PublicKey;
  state: PublicKey;
  vault0: TokenVault;
  vault1: TokenVault;
  lpMint: Mint;
}

export class RaydiumPda {
  programId: PublicKey;
  seeds: RaydiumSeeds;

  constructor(programId: PublicKey) {
    this.programId = programId;
    this.seeds = new RaydiumSeeds();
  }

  getAuthAddress() {
    return PublicKey.findProgramAddressSync([this.seeds.auth], this.programId);
  }

  getAmmAddress(index: number) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.amm, u16ToBytes(index)],
      this.programId
    );
  }

  getStateAddress(amm: PublicKey, mint0: PublicKey, mint1: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.state, amm.toBuffer(), mint0.toBuffer(), mint1.toBuffer()],
      this.programId
    );
  }

  getVaultAddress(state: PublicKey, mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.vault, state.toBuffer(), mint.toBuffer()],
      this.programId
    );
  }

  getLpMintAddress(state: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.lpMint, state.toBuffer()],
      this.programId
    );
  }

  getOracleAddress(state: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [this.seeds.oracle, state.toBuffer()],
      this.programId
    );
  }
}

export class RaydiumSeeds {
  auth: Buffer;
  amm: Buffer;
  state: Buffer;
  vault: Buffer;
  lpMint: Buffer;
  oracle: Buffer;

  constructor() {
    this.auth = this.toSeed("vault_and_lp_mint_auth_seed");
    this.amm = this.toSeed("amm_config");
    this.state = this.toSeed("pool");
    this.vault = this.toSeed("pool_vault");
    this.lpMint = this.toSeed("pool_lp_mint");
    this.oracle = this.toSeed("observation");
  }

  toSeed(seed: string) {
    return Buffer.from(anchor.utils.bytes.utf8.encode(seed));
  }
}

export function createRaydiumProgram(
  provider: anchor.Provider
): Program<CpRaydium> {
  return new Program<CpRaydium>(IDL, cpSwapProgram, provider);
}
