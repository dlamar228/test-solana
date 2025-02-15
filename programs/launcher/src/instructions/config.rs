use crate::errors::ErrorCode;
use crate::states::*;

use super::*;

pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
    let config_id = ctx.accounts.config.key();

    let config = &mut ctx.accounts.config;
    config.bump = ctx.bumps.config;
    config.team_tokens = 50_000_000 * 10u64.pow(9);
    config.faucet_tokens = 50_000_000 * 10u64.pow(9);

    emit!(InitializeConfigEvent {
        config_id,
        admin_id: ctx.accounts.payer.key(),
        team_tokens: config.team_tokens,
        faucet_tokens: config.faucet_tokens,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        seeds = [LAUNCHER_CONFIG_SEED.as_bytes()],
        bump,
        payer = payer,
        space = ConfigState::LEN
    )]
    pub config: Account<'info, ConfigState>,
    pub system_program: Program<'info, System>,
}

pub fn update_config_team_tokens(ctx: Context<UpdateConfigState>, team_tokens: u64) -> Result<()> {
    if team_tokens > MAX_TEAM_TOKENS {
        return err!(ErrorCode::InvalidTokenAmount);
    }

    let config = &mut ctx.accounts.config;
    let old_team_tokens = config.team_tokens;
    config.team_tokens = team_tokens;

    emit!(UpdateConfigTeamTokensEvent {
        admin_id: ctx.accounts.payer.key(),
        old_team_tokens,
        new_team_tokens: team_tokens,
    });

    Ok(())
}

pub fn update_config_faucet_tokens(
    ctx: Context<UpdateConfigState>,
    faucet_tokens: u64,
) -> Result<()> {
    if faucet_tokens > MAX_FAUCET_TOKENS {
        return err!(ErrorCode::InvalidTokenAmount);
    }

    let config = &mut ctx.accounts.config;
    let old_faucet_tokens = config.faucet_tokens;
    config.faucet_tokens = faucet_tokens;

    emit!(UpdateConfigFaucetTokensEvent {
        admin_id: ctx.accounts.payer.key(),
        old_faucet_tokens,
        new_faucet_tokens: faucet_tokens,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfigState<'info> {
    #[account(address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [LAUNCHER_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump = authority_manager.bump
    )]
    pub authority_manager: Account<'info, AuthorityManager>,
    #[account(
        mut,
        seeds = [LAUNCHER_CONFIG_SEED.as_bytes()],
        bump = config.bump,
    )]
    pub config: Account<'info, ConfigState>,
}
