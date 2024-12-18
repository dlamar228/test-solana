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
    /// Address of the provided pool token mint is incorrect
    #[msg("Address of the provided lp token mint is incorrect")]
    IncorrectLpMint,
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
}
