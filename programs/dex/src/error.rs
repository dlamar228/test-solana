/// Errors that may be returned by the TokenSwap program.
use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Not approved")]
    NotApproved,
    #[msg("Invalid owner")]
    InvalidProtocolOwner,
    /// The input token account is empty.
    #[msg("Input token account empty")]
    EmptySupply,
    /// The input token is invalid for swap.
    #[msg("InvalidInput")]
    InvalidInput,
    /// Exceeds desired slippage limit
    #[msg("Exceeds desired slippage limit")]
    ExceededSlippage,
    /// Given pool token amount results in zero trading tokens
    #[msg("Given pool token amount results in zero trading tokens")]
    ZeroTradingTokens,
    #[msg("Not support token_2022 mint extension")]
    NotSupportMint,
    #[msg("Invalid vault")]
    InvalidVault,
    #[msg("lp token amount is zero")]
    LpIsZero,
    #[msg("Invalid cast to u64")]
    InvalidU64Cast,
    #[msg("Calculation overflow")]
    Overflow,
    #[msg("Calculation underflow")]
    Underflow,
    #[msg("Calculation div by zero")]
    DivZero,
    #[msg("Dex launched")]
    DexLaunched,
}
