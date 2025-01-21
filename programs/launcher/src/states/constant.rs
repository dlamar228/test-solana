use super::*;

#[constant]
pub const LAUNCHER_AUTHORITY_SEED: &str = "launcher_authority";

#[constant]
pub const LAUNCHER_AUTHORITY_MANAGER_SEED: &str = "launcher_authority_manager";

#[constant]
pub const LAUNCHER_CONFIG_SEED: &str = "launcher_config";

#[constant]
pub const LAUNCHER_TEAM_VAULT_SEED: &str = "launcher_team_vault";

#[constant]
pub const LAUNCHER_MINT_METADATA: &str = "metadata";

#[constant]
pub const MAX_TOKEN_SUPPLY: u64 = 1_000_000_000 * 10u64.pow(9);

#[constant]
pub const MAX_TEAM_TOKENS: u64 = 100_000_000 * 10u64.pow(9);

#[constant]
pub const MAX_FAUCET_TOKENS: u64 = 100_000_000 * 10u64.pow(9);
