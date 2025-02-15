use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Not approved")]
    NotApproved,
    #[msg("Invalid owner")]
    InvalidAdmin,
    #[msg("Invalid cpi authority")]
    InvalidCpiAuthority,
    /// The input token account is empty.
    #[msg("Input token account empty")]
    EmptySupply,
    /// The input token is invalid for swap.
    #[msg("Invalid input")]
    InvalidInput,
    #[msg("Exceeds desired slippage limit")]
    ExceededSlippage,
    #[msg("Given pool token amount results in zero trading tokens")]
    ZeroTradingTokens,
    #[msg("Not support token_2022 mint extension")]
    NotSupportMint,
    #[msg("Invalid vault")]
    InvalidVault,
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
    #[msg("Dex ready to launch")]
    DexReadyToLaunch,
    #[msg("Dex not ready to launch")]
    DexNotReadyToLaunch,
}
