use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod states;
pub mod utils;

use instructions::*;

declare_id!("9ZVY6FrxsgoT29cqTxCPjdVBv2qLTEQHB29pYPnV5LGa");

#[program]
pub mod launcher {
    use super::*;

    pub fn initialize_authority_manager(
        ctx: Context<InitializeAuthorityManager>,
        faucet_authority: Pubkey,
    ) -> Result<()> {
        instructions::initialize_authority_manager(ctx, faucet_authority)
    }

    pub fn update_authority_manager_admin(
        ctx: Context<UpdateAuthorityManager>,
        new_admin: Pubkey,
    ) -> Result<()> {
        instructions::update_authority_manager_admin(ctx, new_admin)
    }

    pub fn update_authority_manager_faucet_authority(
        ctx: Context<UpdateAuthorityManager>,
        faucet_authority: Pubkey,
    ) -> Result<()> {
        instructions::update_authority_manager_faucet_authority(ctx, faucet_authority)
    }

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        instructions::initialize_config(ctx)
    }

    pub fn update_config_team_tokens(
        ctx: Context<UpdateConfigState>,
        team_tokens: u64,
    ) -> Result<()> {
        instructions::update_config_team_tokens(ctx, team_tokens)
    }

    pub fn update_config_faucet_tokens(
        ctx: Context<UpdateConfigState>,
        faucet_tokens: u64,
    ) -> Result<()> {
        instructions::update_config_faucet_tokens(ctx, faucet_tokens)
    }

    pub fn initialize_dex(ctx: Context<CpiInitializeDex>) -> Result<()> {
        instructions::cpi_initialize_dex(ctx)
    }

    pub fn initialize_dex_with_faucet(ctx: Context<CpiInitializeDexWithFaucet>) -> Result<()> {
        instructions::cpi_initialize_dex_with_faucet(ctx)
    }

    pub fn initialize_mint(
        ctx: Context<InitializeMint>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        instructions::initialize_mint(ctx, name, symbol, uri)
    }

    pub fn withdraw_team_tokens(ctx: Context<WithdrawTeamTokens>) -> Result<()> {
        instructions::withdraw_team_tokens(ctx)
    }
}
