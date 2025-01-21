use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid admin")]
    InvalidAdmin,
    #[msg("Invalid token amount")]
    InvalidTokenAmount,
}
