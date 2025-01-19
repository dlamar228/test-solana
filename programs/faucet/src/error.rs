use super::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid admin")]
    InvalidAdmin,
    #[msg("Last admin")]
    LastAdmin,
    #[msg("Invalid admin index")]
    InvalidAdminIndex,
    #[msg("Reached shard limit")]
    ShardLimit,
    #[msg("Invalid start/end claim time")]
    InvalidFaucetTime,
    #[msg("Invalid token amount")]
    InvalidTokenAmount,
    #[msg("Faucet not started/finished")]
    InvalidClaimTime,
    #[msg("Invalid withdraw token amount")]
    InvalidWithdrawTokenAmount,
    #[msg("Tokens already claimed")]
    TokensAlreadyClaimed,
    #[msg("Invalid proof")]
    InvalidProof,
    #[msg("Failed calculate transfer fee")]
    FiledCalculateTransferFee,
}
